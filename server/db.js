'use strict';
/**
 * 数据库初始化与公共操作
 * 表结构与前端 index.html 的数据模型一一对应：
 *   六级组织树（全国/大区/小区/门店/岗位/人员）→ org_nodes
 *   10 岗位配置（含差异化积分权重 pw）→ posts
 *   人员 × 日期 × 11 项指标 → daily_metrics（积分不入库，查询时按岗位权重现算）
 *   人员→祖先 物化路径 → node_paths（聚合查询用）
 */
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

// 数据目录可用环境变量覆盖（容器挂载卷 / 多环境隔离，如 DATA_DIR=/srv/dashboard-data）
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'dashboard.db');

// 11 项指标：驼峰（API/前端）↔ 下划线（库表列）
const METRIC_COLS = {
  leads: 'leads',
  validLeads: 'valid_leads',
  intentLeads: 'intent_leads',
  invites: 'invites',
  arrivals: 'arrivals',
  testDrives: 'test_drives',
  testReviews: 'test_reviews',
  returnVisits: 'return_visits',
  opportunities: 'opportunities',
  locked: 'locked',
  delivered: 'delivered'
};
const METRIC_KEYS = Object.keys(METRIC_COLS);

// 默认积分权重（与前端 DEFAULT_POINTS_W 一致；posts 表可按岗位覆盖）
const DEFAULT_PW = { locked: 30, delivered: 50, testDrives: 6, invites: 4, returnVisits: 5, opportunities: 8 };

// 10 岗位出厂配置（与前端 index.html POSTS 一致）：建库即写入，保证空库也能直接导入名册
// 生产如需调整编制或积分权重，直接 UPDATE posts 表（OR REPLACE 仅由 seed.js 执行）
const DEFAULT_POSTS = [
  { key: 'dataExpert', name: '数营专家', color: '#22d3ee', min: 0, max: 1, pw: { locked: 22, delivered: 30, testDrives: 8, invites: 6, returnVisits: 6, opportunities: 10 } },
  { key: 'salesManager', name: '销售店长', color: '#8b5cf6', min: 1, max: 1, pw: { locked: 36, delivered: 55, testDrives: 5, invites: 4, returnVisits: 4, opportunities: 7 } },
  { key: 'salesSpecialist', name: '销售专员', color: '#3b82f6', min: 2, max: 4, pw: { locked: 30, delivered: 50, testDrives: 6, invites: 4, returnVisits: 5, opportunities: 8 } },
  { key: 'productExpert', name: '产品专家', color: '#06b6d4', min: 2, max: 3, pw: { locked: 28, delivered: 40, testDrives: 12, invites: 5, returnVisits: 7, opportunities: 10 } },
  { key: 'deliveryManager', name: '交付店长', color: '#a78bfa', min: 1, max: 1, pw: { locked: 20, delivered: 70, testDrives: 4, invites: 3, returnVisits: 6, opportunities: 9 } },
  { key: 'deliverySpecialist', name: '交付专员', color: '#c084fc', min: 2, max: 3, pw: { locked: 24, delivered: 60, testDrives: 5, invites: 4, returnVisits: 5, opportunities: 8 } },
  { key: 'liveStreamer', name: '直播专员', color: '#ec4899', min: 0, max: 2, pw: { locked: 26, delivered: 45, testDrives: 7, invites: 8, returnVisits: 4, opportunities: 9 } },
  { key: 'newMedia', name: '新媒体运营', color: '#f472b6', min: 0, max: 1, pw: { locked: 22, delivered: 36, testDrives: 5, invites: 7, returnVisits: 5, opportunities: 8 } },
  { key: 'marketManager', name: '市场经理', color: '#f59e0b', min: 1, max: 1, pw: { locked: 24, delivered: 42, testDrives: 5, invites: 8, returnVisits: 5, opportunities: 7 } },
  { key: 'customerManager', name: '客户管家/经理', color: '#10b981', min: 2, max: 3, pw: { locked: 30, delivered: 48, testDrives: 6, invites: 9, returnVisits: 8, opportunities: 10 } }
];

function openDb() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
  return db;
}

function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS org_nodes (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      name      TEXT NOT NULL,
      level     TEXT NOT NULL,             -- 全国/大区/小区/门店/岗位/人员
      parent_id INTEGER REFERENCES org_nodes(id),
      post_key  TEXT,                      -- 岗位/人员节点所属岗位 key
      store_id  INTEGER,                   -- 岗位/人员节点所属门店（冗余，加速人员汇总查询）
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );
    CREATE INDEX IF NOT EXISTS idx_org_parent ON org_nodes(parent_id);
    CREATE INDEX IF NOT EXISTS idx_org_level  ON org_nodes(level);

    CREATE TABLE IF NOT EXISTS posts (
      key             TEXT PRIMARY KEY,
      name            TEXT NOT NULL,
      color           TEXT NOT NULL,
      min_cnt         INTEGER NOT NULL DEFAULT 0,
      max_cnt         INTEGER NOT NULL DEFAULT 1,
      pw_locked       REAL NOT NULL DEFAULT 30,
      pw_delivered    REAL NOT NULL DEFAULT 50,
      pw_test_drives  REAL NOT NULL DEFAULT 6,
      pw_invites      REAL NOT NULL DEFAULT 4,
      pw_return_visits REAL NOT NULL DEFAULT 5,
      pw_opportunities REAL NOT NULL DEFAULT 8
    );

    CREATE TABLE IF NOT EXISTS daily_metrics (
      person_id    INTEGER NOT NULL,
      date         TEXT NOT NULL,          -- YYYY-MM-DD
      ${METRIC_KEYS.map(k => METRIC_COLS[k] + ' REAL NOT NULL DEFAULT 0').join(',\n      ')},
      PRIMARY KEY (person_id, date)
    );
    CREATE INDEX IF NOT EXISTS idx_metrics_date ON daily_metrics(date);

    -- 物化路径：人员 → 其所有祖先（含自身），聚合查询按 ancestor_id 一次 JOIN
    CREATE TABLE IF NOT EXISTS node_paths (
      person_id   INTEGER NOT NULL,
      ancestor_id INTEGER NOT NULL,
      PRIMARY KEY (person_id, ancestor_id)
    );
    CREATE INDEX IF NOT EXISTS idx_paths_ancestor ON node_paths(ancestor_id);

    CREATE TABLE IF NOT EXISTS import_logs (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      type        TEXT NOT NULL,           -- org / metrics
      filename    TEXT,
      uploaded_at TEXT DEFAULT (datetime('now','localtime')),
      rows_ok     INTEGER NOT NULL DEFAULT 0,
      rows_failed INTEGER NOT NULL DEFAULT 0,
      report_json TEXT
    );
  `);
  // 旧库升级：补充 store_id 冗余列（已存在则忽略）
  try { db.exec('ALTER TABLE org_nodes ADD COLUMN store_id INTEGER'); } catch (e) { /* ignore */ }
  seedDefaultPosts(db);
}

/** 出厂岗位配置：仅填补缺失的岗位（已存在则保留现有编制与权重，便于生产环境自行调整） */
function seedDefaultPosts(db) {
  const ins = db.prepare(`INSERT OR IGNORE INTO posts
    (key, name, color, min_cnt, max_cnt, pw_locked, pw_delivered, pw_test_drives, pw_invites, pw_return_visits, pw_opportunities)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const tx = db.transaction(() => DEFAULT_POSTS.forEach(p => ins.run(
    p.key, p.name, p.color, p.min, p.max,
    p.pw.locked, p.pw.delivered, p.pw.testDrives, p.pw.invites, p.pw.returnVisits, p.pw.opportunities
  )));
  tx();
}

/** 查找或创建组织节点，返回节点 id（幂等，导入/seed 共用） */
function findOrCreateNode(db, name, level, parentId, postKey) {
  const found = db.prepare(
    'SELECT id FROM org_nodes WHERE name = ? AND level = ? AND parent_id IS ?'
  ).get(name, level, parentId === null ? null : parentId);
  if (found) return found.id;
  const r = db.prepare(
    'INSERT INTO org_nodes (name, level, parent_id, post_key) VALUES (?, ?, ?, ?)'
  ).run(name, level, parentId, postKey || null);
  return r.lastInsertRowid;
}

/** 取某节点的祖先链（含自身），自底向上 */
function ancestorChain(db, nodeId) {
  const chain = [];
  let cur = db.prepare('SELECT id, name, level, parent_id, post_key FROM org_nodes WHERE id = ?').get(nodeId);
  while (cur) {
    chain.push(cur.id);
    if (cur.parent_id === null) break;
    cur = db.prepare('SELECT id, name, level, parent_id, post_key FROM org_nodes WHERE id = ?').get(cur.parent_id);
  }
  return chain;
}

/** 为人员节点重建 node_paths（含自身） */
function refreshPersonPaths(db, personId) {
  const chain = ancestorChain(db, personId);
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM node_paths WHERE person_id = ?').run(personId);
    const ins = db.prepare('INSERT OR IGNORE INTO node_paths (person_id, ancestor_id) VALUES (?, ?)');
    chain.forEach(aid => ins.run(personId, aid));
  });
  tx();
}

/** 全量重建 node_paths 与 org_nodes.store_id 冗余列（名册导入后调用一次即可） */
function rebuildAllPaths(db) {
  const persons = db.prepare("SELECT id FROM org_nodes WHERE level = '人员'").all();
  const levelById = new Map(db.prepare('SELECT id, level FROM org_nodes').all().map(r => [r.id, r.level]));
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM node_paths').run();
    const ins = db.prepare('INSERT OR IGNORE INTO node_paths (person_id, ancestor_id) VALUES (?, ?)');
    const setStore = db.prepare('UPDATE org_nodes SET store_id = ? WHERE id = ?');
    for (const p of persons) {
      const chain = ancestorChain(db, p.id);
      chain.forEach(aid => ins.run(p.id, aid));
      const storeId = chain.find(aid => levelById.get(aid) === '门店') || null;
      setStore.run(storeId, p.id);
    }
    // 岗位节点同样回填 store_id（其子节点即人员）
    const posts = db.prepare("SELECT id FROM org_nodes WHERE level = '岗位'").all();
    for (const pn of posts) {
      const chain = ancestorChain(db, pn.id);
      const storeId = chain.find(aid => levelById.get(aid) === '门店') || null;
      setStore.run(storeId, pn.id);
    }
  });
  tx();
  return persons.length;
}

module.exports = {
  DB_PATH, DATA_DIR, METRIC_COLS, METRIC_KEYS, DEFAULT_PW, DEFAULT_POSTS,
  openDb, findOrCreateNode, ancestorChain, refreshPersonPaths, rebuildAllPaths
};
