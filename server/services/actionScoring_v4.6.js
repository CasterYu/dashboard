'use strict';
// v4.6 灯塔动作积分服务
let XLSX = null;
function xlsx() { return XLSX || (XLSX = require('xlsx')); }
// --- DDL ---
const DDL = [
  `CREATE TABLE IF NOT EXISTS action_rules (
     post_key TEXT NOT NULL, item TEXT NOT NULL, seq INTEGER, action TEXT,
     per REAL NOT NULL DEFAULT 0, cap_normal REAL NOT NULL DEFAULT 1, cap_weekend REAL NOT NULL DEFAULT 1,
     must_do TEXT, judge TEXT, no_score TEXT, evidence TEXT, enabled INTEGER NOT NULL DEFAULT 1,
     updated_at TEXT DEFAULT (datetime('now','localtime')), PRIMARY KEY (post_key, item))`,
  `CREATE TABLE IF NOT EXISTS action_scores (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     person_id INTEGER NOT NULL, emp_no TEXT, person_name TEXT, post_key TEXT NOT NULL,
     store_id INTEGER, store_code TEXT, store_name TEXT, date TEXT NOT NULL,
     item TEXT NOT NULL, action TEXT, score REAL NOT NULL DEFAULT 0,
     ok INTEGER NOT NULL DEFAULT 0, evidence TEXT, order_no TEXT,
     UNIQUE (person_id, date, item, action, order_no))`,
  `CREATE TABLE IF NOT EXISTS action_daily_sums (
     person_id INTEGER NOT NULL, emp_no TEXT, post_key TEXT NOT NULL,
     store_id INTEGER, date TEXT NOT NULL, item TEXT NOT NULL,
     target TEXT, cnt REAL NOT NULL DEFAULT 0, target_score REAL NOT NULL DEFAULT 0,
     score REAL NOT NULL DEFAULT 0,
     PRIMARY KEY (person_id, date, item))`,
  'CREATE INDEX IF NOT EXISTS idx_as_date ON action_scores(date)',
  'CREATE INDEX IF NOT EXISTS idx_as_person ON action_scores(person_id, date)',
  'CREATE INDEX IF NOT EXISTS idx_as_store ON action_scores(store_id, date)',
  'CREATE INDEX IF NOT EXISTS idx_ads_date ON action_daily_sums(date)',
  'CREATE INDEX IF NOT EXISTS idx_ads_person ON action_daily_sums(person_id, date)'
];

function migrateScoring(db) {
  db.exec(DDL.join(';\n'));
  // 旧库补列（CREATE TABLE IF NOT EXISTS 对已存在的表不生效）
  ['seq INTEGER'].forEach(col => { try { db.exec('ALTER TABLE action_rules ADD COLUMN ' + col); } catch (e) { /* ignore */ } });
  return true;
}

/**
 * 规则导入：兼容前端数据文件的 postRules 结构
 *   { postRules: { postKey: { postName, items: [{ seq, name, target, per, cap, capWeekend, mustDo, noScore, where, actScore }] } } }
 * 覆盖式写入（同 post_key + item 覆盖），缺失项置 enabled = 0
 */
function importRules(db, payload) {
  const src = (payload && (payload.postRules || payload.rules)) || payload || {};
  const rows = [];
  if (Array.isArray(src)) {
    for (const r of src) {
      rows.push({
        postKey: r.postKey || r.post_key, seq: toNum(r.seq), item: clean(r.item || r.name),
        action: clean(r.action || r.target), per: toNum(r.per),
        capNormal: r.capNormal != null ? toNum(r.capNormal) : toNum(r.cap),
        capWeekend: r.capWeekend != null ? toNum(r.capWeekend) : toNum(r.cap),
        mustDo: clean(r.mustDo), judge: clean(r.judge || r.where), noScore: clean(r.noScore),
        evidence: clean(r.evidence || r.where), enabled: r.enabled === false ? 0 : 1
      });
    }
  } else {
    for (const postKey of Object.keys(src)) {
      const post = src[postKey] || {};
      (post.items || []).forEach((it, i) => rows.push({
        postKey, seq: it.seq != null ? toNum(it.seq) : i + 1,
        item: clean(it.name || it.item), action: clean(it.target || it.action),
        per: toNum(it.per), capNormal: toNum(it.cap), capWeekend: toNum(it.capWeekend),
        mustDo: clean(it.mustDo), judge: clean(it.where || it.judge), noScore: clean(it.noScore),
        evidence: clean(it.where || it.evidence), enabled: 1
      }));
    }
  }
  const valid = rows.filter(r => r.postKey && r.item);
  const ins = db.prepare(`INSERT INTO action_rules
    (post_key, item, seq, action, per, cap_normal, cap_weekend, must_do, judge, no_score, evidence, enabled, updated_at)
    VALUES (@postKey, @item, @seq, @action, @per, @capNormal, @capWeekend, @mustDo, @judge, @noScore, @evidence, @enabled, datetime('now','localtime'))
    ON CONFLICT(post_key, item) DO UPDATE SET
      seq = excluded.seq, action = excluded.action, per = excluded.per,
      cap_normal = excluded.cap_normal, cap_weekend = excluded.cap_weekend,
      must_do = excluded.must_do, judge = excluded.judge, no_score = excluded.no_score,
      evidence = excluded.evidence, enabled = excluded.enabled, updated_at = excluded.updated_at`);
  const tx = db.transaction(() => valid.forEach(r => ins.run(r)));
  tx();
  const posts = Array.from(new Set(valid.map(r => r.postKey)));
  return { rowsOk: valid.length, rowsSkipped: rows.length - valid.length, posts, postCount: posts.length };
}

// --- 岗位别名 ---
const POST_ALIAS = {
  '交付专员': 'deliverySpecialist', '交付店长': 'deliveryManager', '销售店长': 'salesManager',
  '销售专员': 'salesSpecialist', '产品专家': 'productExpert', '数营专家': 'dataExpert',
  '直播专员': 'liveStreamer', '新媒体运营': 'newMedia', '市场经理': 'marketManager',
  '客户管家': 'customerManager', '客户管家/经理': 'customerManager'
};
function postKeyOf(label) {
  const s = clean(label).replace(/\s/g, '');
  return POST_ALIAS[s] || POST_ALIAS[s.replace(/\/.*$/, '')] || null;
}
function sheetRows(buffer, idx) {
  const wb = xlsx().read(buffer, { type: 'buffer', cellDates: false });
  const ws = wb.Sheets[wb.SheetNames[idx]];
  if (!ws) throw new Error('文件中无第 ' + (idx + 1) + ' 个工作表');
  return xlsx().utils.sheet_to_json(ws, { defval: '', raw: true, header: 1, blankrows: false });
}

function clean(v) { return v === null || v === undefined ? '' : String(v).trim(); }
function toNum(v) {
  const s = clean(v).replace(/[,，\s]/g, '').replace(/分$/, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}
function normDate(v) {
  const s = clean(v).slice(0, 10).replace(/\//g, '-');
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

/** 解析评分明细（sheet1）与个人日汇总（sheet2） */
function parseScoring(buffer, postKey) {
  const d = sheetRows(buffer, 0), s = sheetRows(buffer, 1);
  const details = [], sums = [];
  for (const r of d.slice(2)) {
    const storeName = clean(r[0]), emp = clean(r[4]);
    if (!storeName || !emp) continue;
    details.push({
      storeCode: clean(r[1]), storeName, personName: clean(r[3]), emp,
      date: normDate(r[5]), item: clean(r[6]), action: clean(r[7]),
      score: toNum(r[8]), evidence: clean(r[9]), orderNo: clean(r[11]), postKey
    });
  }
  for (const r of s.slice(2)) {
    const emp = clean(r[4]);
    if (!emp) continue;
    sums.push({
      storeCode: clean(r[1]), storeName: clean(r[0]), emp, personName: clean(r[3]),
      date: normDate(r[5]), item: clean(r[6]), target: clean(r[7]),
      cnt: toNum(r[8]), targetScore: toNum(r[9]), score: toNum(r[10]), postKey
    });
  }
  return { details, sums };
}

/** 评分导入：落库门店/人员层级 + 明细 + 汇总（同人同日同项覆盖） */
function importScoring(db, buffer, filename, opts) {
  const o = opts || {};
  const postKey = o.postKey || postKeyOf(o.post || filename) || 'deliverySpecialist';
  const { details, sums } = parseScoring(buffer, postKey);
  const storeCache = new Map(), personCache = new Map();
  const storeByName = db.prepare("SELECT id, name FROM org_nodes WHERE level = '门店' AND status = 1 AND name = ?");
  const postName = (db.prepare('SELECT name FROM posts WHERE key = ?').get(postKey) || {}).name || postKey;
  const dbh = require('../db');
  const unmatchedStores = new Set();
  let rowsOk = 0, rowsSum = 0;
  function personOf(emp, name, storeName) {
    const key = emp || (storeName + '|' + name);
    if (personCache.has(key)) return personCache.get(key);
    let node = emp ? dbh.findPersonByEmpNo(db, emp) : undefined;
    if (!node) {
      const label = clean(name) || emp || '未知人员';
      const sid = storeOf(storeName);
      const postNodeId = dbh.findOrCreateNode(db, postName, '岗位', sid, postKey);
      const id = emp ? dbh.createPersonNode(db, label, postNodeId, postKey, sid)
                     : dbh.findOrCreateNode(db, label, '人员', postNodeId, postKey);
      if (emp) dbh.setPersonEmpNo(db, id, emp);
      node = db.prepare('SELECT id, name FROM org_nodes WHERE id = ?').get(id);
    }
    personCache.set(key, node);
    return node;
  }

  function storeOf(name) {
    if (!storeCache.has(name)) {
      const hit = storeByName.get(name);
      if (hit) storeCache.set(name, hit.id);
      else {
        // 名册未覆盖的专营店：自动落库为顶层门店节点，保证人员层级与门店归属可追溯
        const label = clean(name) || '未匹配门店（评分导入）';
        const id = dbh.findOrCreateNode(db, label, '门店', null, null);
        storeCache.set(name, id);
        unmatchedStores.add(label);
      }
    }
    return storeCache.get(name) || 0;
  }

  const insDetail = db.prepare(`INSERT OR REPLACE INTO action_scores
    (person_id, emp_no, person_name, post_key, store_id, store_code, store_name, date, item, action, score, ok, evidence, order_no)
    VALUES (@personId, @empNo, @name, @postKey, @storeId, @storeCode, @storeName, @date, @item, @action, @score, @ok, @evidence, @orderNo)`);
  const insSum = db.prepare('INSERT OR REPLACE INTO action_daily_sums (person_id, emp_no, post_key, store_id, date, item, target, cnt, target_score, score) VALUES (?,?,?,?,?,?,?,?,?,?)');
  const tx = db.transaction(() => {
    for (const d of details) {
      if (!d.date) continue;
      const sid = storeOf(d.storeName);
      const p = personOf(d.emp, d.personName, d.storeName);
      insDetail.run({
        personId: p.id, empNo: d.emp, name: d.personName || p.name, postKey: d.postKey,
        storeId: sid, storeCode: d.storeCode, storeName: d.storeName, date: d.date,
        item: d.item, action: d.action || '', score: d.score, ok: d.score >= 0 ? 1 : 0,
        evidence: d.evidence || null, orderNo: d.orderNo || ''
      });
      rowsOk++;
    }
    for (const s of sums) {
      if (!s.date) continue;
      const sid = storeOf(s.storeName);
      const p = personOf(s.emp, s.personName, s.storeName);
      insSum.run(p.id, s.emp, s.postKey, sid, s.date, s.item, s.target, s.cnt, s.targetScore, s.score);
      rowsSum++;
    }
  });
  tx();
  return {
    postKey, postName,
    detailRows: rowsOk, sumRows: rowsSum,
    persons: personCache.size,
    storesFromRoster: storeCache.size - unmatchedStores.size,
    storesCreated: Array.from(unmatchedStores).slice(0, 50),
    storesCreatedCount: unmatchedStores.size,
    days: Array.from(new Set(details.concat(sums).map(x => x.date).filter(Boolean))).sort()
  };
}
module.exports = { migrateScoring, importScoring, importRules, DDL, sheetRows, clean, toNum, normDate, postKeyOf, parseScoring };

