'use strict';
/**
 * Excel/CSV 导入服务：解析 → 列校验 → 逐行校验（失败进报告，不中断）→ 事务 upsert
 * 名册（org）：大区/小区/门店/岗位/人员，幂等合并，不删除既有节点
 * 指标（metrics）：同人同日覆盖更新（upsert），遇到未知门店/人员直接记失败
 */
const XLSX = require('xlsx');
const { METRIC_COLS, METRIC_KEYS, findOrCreateNode, rebuildAllPaths } = require('../db');

// 指标列中文名 → 驼峰 key（与前端 METRIC_LABEL 一致）
const METRIC_LABELS = {
  '线索量': 'leads', '有效线索': 'validLeads', '意向线索': 'intentLeads', '邀约排程': 'invites',
  '到店量': 'arrivals', '有效试驾': 'testDrives', '试驾点评数': 'testReviews', '二次回访': 'returnVisits',
  '商机量': 'opportunities', '锁单量': 'locked', '交付量': 'delivered'
};

const ORG_HEADERS = ['大区', '小区', '门店', '岗位', '人员'];
const METRICS_HEADERS = ['日期', '门店', '人员', '岗位'].concat(Object.keys(METRIC_LABELS));

/** 解析上传文件（.xlsx/.xls/.csv）为 [{row: 行号(数据起始=2), data: {列名: 值}}] */
function parseSheet(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new Error('文件中无工作表');
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
  return rows.map((r, i) => ({ row: i + 2, data: r })); // 表头占第 1 行
}

function pick(row, ...names) {
  for (const n of names) {
    if (row[n] !== undefined && String(row[n]).trim() !== '') return String(row[n]).trim();
  }
  return '';
}

function toNum(v) {
  if (v === '' || v === null || v === undefined) return 0;
  const n = Number(String(v).replace(/[,，\s]/g, ''));
  return Number.isFinite(n) ? n : NaN;
}

function normDate(v) {
  const s = String(v || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{4})[\/.年](\d{1,2})[\/.月](\d{1,2})日?$/);
  if (m) return `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;
  // Excel 序列日期
  const n = Number(s);
  if (Number.isFinite(n) && n > 20000 && n < 60000) {
    const d = new Date(Math.round((n - 25569) * 86400 * 1000));
    return d.toISOString().slice(0, 10);
  }
  return null;
}

/** 名册导入：返回 {rowsOk, rowsFailed} */
function importOrg(db, buffer, filename) {
  const rows = parseSheet(buffer);
  const failures = [];
  let ok = 0;
  const postByName = new Map(db.prepare('SELECT key, name FROM posts').all().flatMap(p => [[p.name, p.key], [p.key, p.key]]));

  // 空库首次导入也要有「全国」根节点，否则各大区会成为并列顶层节点
  const rootId = findOrCreateNode(db, '全国', '全国', null);

  const doRow = db.transaction((row) => {
    const region = pick(row, '大区'); const area = pick(row, '小区');
    const store = pick(row, '门店'); const postName = pick(row, '岗位'); const person = pick(row, '人员');
    if (!region || !area || !store || !postName || !person) throw new Error(`字段不完整（大区/小区/门店/岗位/人员均必填）`);
    const postKey = postByName.get(postName);
    if (!postKey) throw new Error(`未知岗位：${postName}`);
    const regionId = findOrCreateNode(db, region, '大区', rootId);
    const areaId = findOrCreateNode(db, area, '小区', regionId);
    const storeId = findOrCreateNode(db, store, '门店', areaId);
    const postNodeId = findOrCreateNode(db, db.prepare('SELECT name FROM posts WHERE key = ?').get(postKey).name, '岗位', storeId, postKey);
    findOrCreateNode(db, person, '人员', postNodeId, postKey);
  });

  const txAll = db.transaction(() => {
    for (const r of rows) {
      try { doRow(r.data); ok++; }
      catch (e) { failures.push({ row: r.row, reason: e.message }); }
    }
  });
  txAll();
  rebuildAllPaths(db); // 名册可能新增人员，全量重建物化路径
  return { rowsOk: ok, rowsFailed: failures };
}

/** 指标导入：返回 {rowsOk, rowsFailed} */
function importMetrics(db, buffer, filename) {
  const rows = parseSheet(buffer);
  const failures = [];
  let ok = 0;

  // 预取：门店名→节点、(门店id,人员名)→人员节点（加速逐行查找）
  const storeByName = new Map(db.prepare("SELECT id, name FROM org_nodes WHERE level = '门店'").all().map(s => [s.name, s]));
  const personByStoreName = new Map();
  db.prepare("SELECT pn.id, pn.name, pn.parent_id, pn.post_key, st.name AS store_name, st.id AS store_id FROM org_nodes pn JOIN node_paths np ON np.person_id = pn.id JOIN org_nodes st ON st.id = np.ancestor_id AND st.level = '门店' WHERE pn.level = '人员'").all()
    .forEach(p => personByStoreName.set(p.store_id + '|' + p.name, p));

  const upsert = db.prepare(`
    INSERT INTO daily_metrics (person_id, date, ${METRIC_KEYS.map(k => METRIC_COLS[k]).join(', ')})
    VALUES (@personId, @date, ${METRIC_KEYS.map(k => '@' + k).join(', ')})
    ON CONFLICT (person_id, date) DO UPDATE SET ${METRIC_KEYS.map(k => METRIC_COLS[k] + ' = @' + k).join(', ')}
  `);

  const txAll = db.transaction(() => {
    for (const r of rows) {
      const row = r.data;
      try {
        const date = normDate(pick(row, '日期', 'date', 'Date'));
        if (!date) throw new Error(`日期无法识别：${pick(row, '日期', 'date', 'Date') || '(空)'}`);
        const storeName = pick(row, '门店');
        const personName = pick(row, '人员');
        if (!storeName || !personName) throw new Error('门店/人员为空');
        const store = storeByName.get(storeName);
        if (!store) throw new Error(`未知门店：${storeName}`);
        let person = personByStoreName.get(store.id + '|' + personName);
        if (!person) throw new Error(`未知人员：${personName}（${storeName}）——请先导入名册`);
        // 岗位列可选：填了则必须与人员岗位一致（用于门店内同名不同岗消歧）
        const postName = pick(row, '岗位');
        if (postName) {
          const post = db.prepare('SELECT key, name FROM posts WHERE name = ? OR key = ?').get(postName, postName);
          if (!post) throw new Error(`未知岗位：${postName}`);
          if (person.post_key && person.post_key !== post.key) {
            const cand = db.prepare("SELECT pn.id FROM org_nodes pn JOIN org_nodes pst ON pn.parent_id = pst.id WHERE pn.level = '人员' AND pn.name = ? AND pst.parent_id = ? AND pst.post_key = ?").get(personName, store.id, post.key);
            if (!cand) throw new Error(`${personName}（${storeName}）岗位不匹配：报表为「${post.name}」，名册为其他岗位`);
            person = { ...person, id: cand.id };
          }
        }
        const params = { personId: person.id, date };
        for (const [label, key] of Object.entries(METRIC_LABELS)) {
          const v = toNum(pick(row, label));
          if (Number.isNaN(v)) throw new Error(`「${label}」非数字：${pick(row, label)}`);
          if (v < 0) throw new Error(`「${label}」不能为负数：${v}`);
          params[key] = v;
        }
        upsert.run(params);
        ok++;
      } catch (e) {
        failures.push({ row: r.row, reason: e.message });
      }
    }
  });
  txAll();
  return { rowsOk: ok, rowsFailed: failures };
}

module.exports = { importOrg, importMetrics, ORG_HEADERS, METRICS_HEADERS, METRIC_LABELS };
