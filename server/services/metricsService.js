'use strict';
/**
 * 指标聚合查询（v4）：按「任职区间」做时间切片
 *
 * 口径要点：
 * - 归属按**当时架构**：dm.date 必须落在 node_paths 的某个任职区间内，节点过滤与门店/岗位归属取该区间
 * - 每人每日只命中一行路径 → 分组求和不会重复计数（路径区间互不重叠是硬约束）
 * - 积分不入库，SQL 内按**当时岗位**权重现算（与前端 pointsOfRaw 口径一致）
 * - KPI/趋势（getDailySeries）不按 status 过滤，保证升级后数值与 v3.8 完全一致；
 *   榜单/明细（getPersonsSummary、getNodesSums）默认排除停用节点，可用 inclInactive=1 包含
 */
const { METRIC_COLS, METRIC_KEYS } = require('../db');

/** 积分权重 SQL 片段；postAlias = 提供权重字段的 posts 别名（当时岗位） */
function pointsExpr(postAlias) {
  return `SUM(
  dm.locked      * COALESCE(${postAlias}.pw_locked, 30) +
  dm.delivered   * COALESCE(${postAlias}.pw_delivered, 50) +
  dm.test_drives * COALESCE(${postAlias}.pw_test_drives, 6) +
  dm.invites     * COALESCE(${postAlias}.pw_invites, 4) +
  dm.return_visits * COALESCE(${postAlias}.pw_return_visits, 5) +
  dm.opportunities * COALESCE(${postAlias}.pw_opportunities, 8)
)`;
}

const SUM_COLS = METRIC_KEYS.map(k => `SUM(dm.${METRIC_COLS[k]}) AS ${k}`).join(',\n       ');

// 自身行（ancestor_id = person_id）连接：每人每日恰好命中一行，携带「当时门店/当时岗位」
const SELF_JOIN = `
    JOIN node_paths nps ON nps.person_id = dm.person_id AND nps.ancestor_id = dm.person_id
      AND dm.date >= nps.from_date AND dm.date <= nps.to_date`;

/** 按日期区间过滤节点归属的 join（nodeId = 0 表示全网，不加此 join） */
const NODE_JOIN = `
    JOIN node_paths np ON np.person_id = dm.person_id AND np.ancestor_id = ?
      AND dm.date >= np.from_date AND dm.date <= np.to_date`;

/**
 * v5.2 节点过滤器：node 参数三态
 *   数字 0        → 全网（不加过滤）
 *   正整数        → 单根子树（NODE_JOIN，v5.1 原口径）
 *   {includeIds, excludeIds} → 显式多根：EXISTS(include) + NOT EXISTS(exclude)
 *     （EXISTS 语义天然去重：同一人员在多个 include 根下不会重复计数）
 * 返回 { type: 'none' | 'all' | 'node' | 'where', sql, params }
 *   none = 显式清空（无任何数据）；where.sql 已含前导 AND，直接拼 WHERE 尾部
 */
function buildNodeFilter(node) {
  if (node && typeof node === 'object' && Array.isArray(node.includeIds)) {
    const inc = node.includeIds, exc = node.excludeIds || [];
    if (!inc.length) return { type: 'none' };
    const incPh = inc.map(() => '?').join(',');
    let sql = ` AND EXISTS (SELECT 1 FROM node_paths npi
        WHERE npi.person_id = dm.person_id AND npi.ancestor_id IN (${incPh})
          AND dm.date >= npi.from_date AND dm.date <= npi.to_date)`;
    const params = inc.slice();
    if (exc.length) {
      const excPh = exc.map(() => '?').join(',');
      sql += ` AND NOT EXISTS (SELECT 1 FROM node_paths npx
        WHERE npx.person_id = dm.person_id AND npx.ancestor_id IN (${excPh})
          AND dm.date >= npx.from_date AND dm.date <= npx.to_date)`;
      params.push.apply(params, exc);
    }
    return { type: 'where', sql: sql, params: params };
  }
  const nid = Number(node) || 0;
  return nid ? { type: 'node', id: nid } : { type: 'all' };
}

/** 节点（含子树全部人员）在 [from, to] 的逐日序列；缺失日期补 0
 *  nodeId = 0 表示「全网/全部人员」；v5.2 起可为 {includeIds, excludeIds} 多根对象 */
function getDailySeries(db, nodeId, from, to) {
  const filter = buildNodeFilter(nodeId);
  if (filter.type === 'none') {
    // 显式清空：直接返回全 0 序列（保持 days 轴完整）
    return emptySeries(from, to);
  }
  const params = [];
  let sql = `SELECT dm.date,
       ${SUM_COLS},
       ${pointsExpr('pw')} AS points
    FROM daily_metrics dm${SELF_JOIN}`;
  if (filter.type === 'node') { sql += NODE_JOIN; params.push(filter.id); }
  sql += `
    LEFT JOIN posts pw ON pw.key = nps.post_key
    WHERE dm.date BETWEEN ? AND ?`;
  params.push(from, to);
  // 注意：过滤条件必须拼在 GROUP BY 之前，否则会被并入 ORDER BY 表达式而静默失效
  if (filter.type === 'where') { sql += filter.sql; params.push.apply(params, filter.params); }
  sql += `
    GROUP BY dm.date
    ORDER BY dm.date`;
  const rows = db.prepare(sql).all(...params);

  const byDate = new Map(rows.map(r => [r.date, r]));
  const days = [];
  const series = {};
  METRIC_KEYS.concat(['points']).forEach(k => { series[k] = []; });
  // 注意：必须用 UTC 构造，避免本地时区导致日期偏移
  const cur = new Date(from + 'T00:00:00Z');
  const end = new Date(to + 'T00:00:00Z');
  while (cur <= end) {
    const d = cur.toISOString().slice(0, 10);
    days.push(d);
    const r = byDate.get(d);
    METRIC_KEYS.concat(['points']).forEach(k => series[k].push(r ? Number(r[k]) : 0));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return { days, series };
}

/** 节点（含子树）在 [from, to] 的人员级汇总（散点图 / 积分榜 / 明细表数据源）；nodeId = 0 表示全部人员
 *  跨店/跨岗人员按人合并求和，另附 assignments（区间内任职明细，供前端展示「当时门店/岗位」）
 *  v5.2 起 nodeId 可为 {includeIds, excludeIds} 多根对象 */
function getPersonsSummary(db, nodeId, from, to, inclInactive) {
  const filter = buildNodeFilter(nodeId);
  if (filter.type === 'none') return [];
  const params = [];
  let sql = `SELECT pn.id AS person_id, pn.name AS person_name, pn.post_key, pn.status AS person_status,
       st.name AS store_name, p.color AS post_color, p.name AS post_name,
       ${SUM_COLS},
       ${pointsExpr('pw')} AS points
    FROM daily_metrics dm${SELF_JOIN}`;
  if (filter.type === 'node') { sql += NODE_JOIN; params.push(filter.id); }
  sql += `
    JOIN org_nodes pn  ON pn.id = dm.person_id
    LEFT JOIN org_nodes st ON st.id = pn.store_id
    LEFT JOIN posts p   ON p.key = pn.post_key
    LEFT JOIN posts pw  ON pw.key = nps.post_key
    WHERE dm.date BETWEEN ? AND ?`;
  params.push(from, to);
  if (filter.type === 'where') { sql += filter.sql; params.push.apply(params, filter.params); }
  if (!inclInactive) sql += '\n      AND pn.status = 1';
  sql += '\n    GROUP BY pn.id\n    ORDER BY points DESC';

  const rows = db.prepare(sql).all(...params);
  const out = rows.map(r => {
    const sums = {};
    METRIC_KEYS.concat(['points']).forEach(k => { sums[k] = Number(r[k]); });
    return {
      personId: r.person_id,
      name: r.person_name,
      storeName: r.store_name,
      postKey: r.post_key,
      postName: r.post_name,
      color: r.post_color,
      status: r.person_status,
      sums,
      assignments: []
    };
  });

  // 任职明细：一次查询覆盖全部人员，避免逐人往返
  if (out.length) {
    const ids = out.map(p => p.personId);
    const segs = db.prepare(`
      SELECT a.person_id, a.post_key, a.store_id, a.from_date, a.to_date,
             st.name AS store_name, p.name AS post_name
      FROM person_assignments a
      LEFT JOIN org_nodes st ON st.id = a.store_id
      LEFT JOIN posts p ON p.key = a.post_key
      WHERE a.person_id IN (${ids.map(() => '?').join(',')})
        AND a.to_date >= ? AND a.from_date <= ?
      ORDER BY a.person_id, a.from_date
    `).all(...ids, from, to);
    const byPerson = new Map();
    segs.forEach(s => {
      if (!byPerson.has(s.person_id)) byPerson.set(s.person_id, []);
      byPerson.get(s.person_id).push({
        postKey: s.post_key, postName: s.post_name,
        storeId: s.store_id, storeName: s.store_name,
        from: s.from_date, to: s.to_date
      });
    });
    out.forEach(p => { p.assignments = byPerson.get(p.personId) || []; });
  }
  return out;
}

/** 批量节点区间合计：一次 SQL 返回多个节点（含各自子树）在 [from, to] 的指标求和 + 积分
 *  供前端下钻热区/榜单/明细节点，避免逐节点拉全量日序列
 *  v5.2：excludeIds 非空时，额外扣减这些子树（显式授权的排除模式；查询祖先节点如「华东大区」时
 *  仍能正确扣掉被排除的「杭州小区」子树，避免经祖先口径看到未授权数据）；
 *  includeIds 非空时（v5.2 祖先穿透），再要求人员必须位于任一 include 根之下——
 *  使「祖先节点（如全国/华南大区）」的合计只统计授权范围内的分支，与 /api/metrics 多根口径一致 */
function getNodesSums(db, nodeIds, from, to, inclInactive, excludeIds, includeIds) {
  if (!nodeIds.length) return {};
  const ph = nodeIds.map(() => '?').join(',');
  const exc = Array.isArray(excludeIds) ? excludeIds.filter(n => Number.isInteger(n)) : [];
  let exclSql = '';
  if (exc.length) {
    exclSql = `
      AND NOT EXISTS (SELECT 1 FROM node_paths npx
        WHERE npx.person_id = dm.person_id AND npx.ancestor_id IN (${exc.map(() => '?').join(',')})
          AND dm.date >= npx.from_date AND dm.date <= npx.to_date)`;
  }
  const inc = Array.isArray(includeIds) ? includeIds.filter(n => Number.isInteger(n)) : [];
  let incSql = '';
  if (inc.length) {
    incSql = `
      AND EXISTS (SELECT 1 FROM node_paths npi
        WHERE npi.person_id = dm.person_id AND npi.ancestor_id IN (${inc.map(() => '?').join(',')})
          AND dm.date >= npi.from_date AND dm.date <= npi.to_date)`;
  }
  const rows = db.prepare(`
    SELECT np.ancestor_id AS nid,
       ${SUM_COLS},
       ${pointsExpr('pw')} AS points
    FROM daily_metrics dm
    JOIN node_paths np  ON np.person_id = dm.person_id AND np.ancestor_id IN (${ph})
      AND dm.date >= np.from_date AND dm.date <= np.to_date
    ${SELF_JOIN}
    JOIN org_nodes nn   ON nn.id = np.ancestor_id${inclInactive ? '' : ' AND nn.status = 1'}
    LEFT JOIN posts pw  ON pw.key = nps.post_key
    WHERE dm.date BETWEEN ? AND ?${incSql}${exclSql}
    GROUP BY np.ancestor_id
  `).all(...nodeIds, from, to, ...inc, ...exc);
  const out = {};
  rows.forEach(r => {
    const m = {};
    METRIC_KEYS.concat(['points']).forEach(k => { m[k] = Number(r[k]); });
    out[r.nid] = m;
  });
  return out;
}

/** 显式清空（include=[]）时返回全 0 序列，保持 days 轴完整（v5.2） */
function emptySeries(from, to) {
  const days = [];
  const cur = new Date(from + 'T00:00:00Z');
  const end = new Date(to + 'T00:00:00Z');
  const series = {};
  METRIC_KEYS.concat(['points']).forEach(k => { series[k] = []; });
  while (cur <= end) {
    const d = cur.toISOString().slice(0, 10);
    days.push(d);
    METRIC_KEYS.concat(['points']).forEach(k => series[k].push(0));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return { days, series };
}

/** 数据中出现过的最大日期范围（供前端初始化日期轴参考） */
function getDateRange(db) {
  const r = db.prepare('SELECT MIN(date) AS min, MAX(date) AS max FROM daily_metrics').get();
  return { from: r.min, to: r.max };
}

module.exports = { getDailySeries, getPersonsSummary, getNodesSums, getDateRange, buildNodeFilter, SUM_COLS, pointsExpr };
