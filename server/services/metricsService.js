'use strict';
/**
 * 指标聚合查询：节点区间日序列 + 人员区间汇总
 * 积分不入库，SQL 内按岗位权重现算（与前端 pointsOfRaw 口径一致：
 * 逐人逐日 加权求和 → 区间求和 → 展示时取整）
 */
const { METRIC_COLS, METRIC_KEYS } = require('../db');

// 积分权重 SQL 片段（posts 无匹配岗位时回退默认权重，与前端 DEFAULT_POINTS_W 一致）
const POINTS_EXPR = `SUM(
  dm.locked      * COALESCE(p.pw_locked, 30) +
  dm.delivered   * COALESCE(p.pw_delivered, 50) +
  dm.test_drives * COALESCE(p.pw_test_drives, 6) +
  dm.invites     * COALESCE(p.pw_invites, 4) +
  dm.return_visits * COALESCE(p.pw_return_visits, 5) +
  dm.opportunities * COALESCE(p.pw_opportunities, 8)
)`;

const SUM_COLS = METRIC_KEYS.map(k => `SUM(dm.${METRIC_COLS[k]}) AS ${k}`).join(',\n       ');

/** 节点（含子树全部人员）在 [from, to] 的逐日序列；缺失日期补 0
 *  nodeId = 0 表示「全网/全部人员」（组织树根节点缺 id 时的兜底口径） */
function getDailySeries(db, nodeId, from, to) {
  const rows = db.prepare(`
    SELECT dm.date,
       ${SUM_COLS},
       ${POINTS_EXPR} AS points
    FROM daily_metrics dm
    JOIN org_nodes pn   ON pn.id = dm.person_id
    LEFT JOIN posts p   ON p.key = pn.post_key
    WHERE dm.date BETWEEN ? AND ?
      AND (? = 0 OR dm.person_id IN (SELECT person_id FROM node_paths WHERE ancestor_id = ?))
    GROUP BY dm.date
    ORDER BY dm.date
  `).all(from, to, nodeId, nodeId);

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

/** 节点（含子树）在 [from, to] 的人员级汇总（散点图 / 积分榜 / 明细表数据源）；nodeId = 0 表示全部人员 */
function getPersonsSummary(db, nodeId, from, to) {
  const rows = db.prepare(`
    SELECT pn.id AS person_id, pn.name AS person_name, pn.post_key,
           st.name AS store_name, p.color AS post_color, p.name AS post_name,
           ${SUM_COLS},
           ${POINTS_EXPR} AS points
    FROM daily_metrics dm
    JOIN org_nodes pn   ON pn.id = dm.person_id
    LEFT JOIN org_nodes st ON st.id = pn.store_id
    LEFT JOIN posts p   ON p.key = pn.post_key
    WHERE dm.date BETWEEN ? AND ?
      AND (? = 0 OR dm.person_id IN (SELECT person_id FROM node_paths WHERE ancestor_id = ?))
    GROUP BY pn.id, st.name
    ORDER BY points DESC
  `).all(from, to, nodeId, nodeId);

  return rows.map(r => {
    const sums = {};
    METRIC_KEYS.concat(['points']).forEach(k => { sums[k] = Number(r[k]); });
    return {
      personId: r.person_id,
      name: r.person_name,
      storeName: r.store_name,
      postKey: r.post_key,
      postName: r.post_name,
      color: r.post_color,
      sums
    };
  });
}

/** 批量节点区间合计：一次 SQL 返回多个节点（含各自子树）在 [from, to] 的指标求和 + 积分
 *  供前端下钻热区/榜单/明细等只需 SUM 的场景，避免逐节点拉全量日序列 */
function getNodesSums(db, nodeIds, from, to) {
  if (!nodeIds.length) return {};
  const ph = nodeIds.map(() => '?').join(',');
  const rows = db.prepare(`
    SELECT np.ancestor_id AS nid,
       ${SUM_COLS},
       ${POINTS_EXPR} AS points
    FROM daily_metrics dm
    JOIN node_paths np  ON np.person_id = dm.person_id AND np.ancestor_id IN (${ph})
    JOIN org_nodes pn   ON pn.id = dm.person_id
    LEFT JOIN posts p   ON p.key = pn.post_key
    WHERE dm.date BETWEEN ? AND ?
    GROUP BY np.ancestor_id
  `).all(...nodeIds, from, to);
  const out = {};
  rows.forEach(r => {
    const m = {};
    METRIC_KEYS.concat(['points']).forEach(k => { m[k] = Number(r[k]); });
    out[r.nid] = m;
  });
  return out;
}

/** 某日期区间内出现过数据的人员的最大日期范围（供前端初始化日期轴参考） */
function getDateRange(db) {
  const r = db.prepare('SELECT MIN(date) AS min, MAX(date) AS max FROM daily_metrics').get();
  return { from: r.min, to: r.max };
}

module.exports = { getDailySeries, getPersonsSummary, getNodesSums, getDateRange };
