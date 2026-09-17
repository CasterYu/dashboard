'use strict';
/**
 * 数据库初始化与公共操作
 * 表结构与前端 index.html 的数据模型一一对应：
 *   六级组织树（全国/大区/小区/门店/岗位/人员）→ org_nodes
 *   10 岗位配置（含差异化积分权重 pw）→ posts
 *   人员 × 日期 × 11 项指标 → daily_metrics（积分不入库，查询时按岗位权重现算）
 *   人员任职记录（岗位/门店/起止区间，调岗真源）→ person_assignments
 *   人员→祖先 物化路径（带任职区间，聚合查询用）→ node_paths
 *   v4 起 org_nodes 带 status（1=在职 0=停用，软删除）与 emp_no（工号，人员唯一标识）
 */
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

// 数据目录可用环境变量覆盖（容器挂载卷 / 多环境隔离，如 DATA_DIR=/srv/dashboard-data）
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'dashboard.db');

// v4 表结构版本：任职区间为闭区间 [from_date, to_date]，开放段用哨兵日期（TEXT 字典序可直接比较）
const SCHEMA_VERSION = 5;
const OPEN_FROM = '1970-01-01';
const OPEN_TO = '9999-12-31';

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

    -- 物化路径（v4）：人员 → 其所有祖先（含自身），带任职区间；调岗后历史归属按当时架构
    -- 同一人员在同一祖先上的区间互不重叠，任何分组求和都不会重复计数
    CREATE TABLE IF NOT EXISTS node_paths (
      person_id   INTEGER NOT NULL,
      ancestor_id INTEGER NOT NULL,
      from_date   TEXT NOT NULL DEFAULT '1970-01-01',
      to_date     TEXT NOT NULL DEFAULT '9999-12-31',
      store_id    INTEGER,                  -- 该段所属门店（当时门店）
      post_key    TEXT,                     -- 该段所属岗位（决定积分权重）
      PRIMARY KEY (person_id, ancestor_id, from_date)
    );
    -- 注意：idx_paths_ancestor_date 不在此处创建——老库的 node_paths 还没有 from_date 列，
    -- 必须等 upgradePathsToV4() 完成结构升级后再建索引，否则会报 no such column
    CREATE INDEX IF NOT EXISTS idx_paths_ancestor ON node_paths(ancestor_id);

    -- 任职记录（真源）：人员 × 岗位 × 门店 × 起止区间；调岗 = 关旧段 + 开新段
    CREATE TABLE IF NOT EXISTS person_assignments (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      person_id    INTEGER NOT NULL,
      post_key     TEXT NOT NULL,
      post_node_id INTEGER NOT NULL,
      store_id     INTEGER NOT NULL DEFAULT 0,
      from_date    TEXT NOT NULL,
      to_date      TEXT NOT NULL DEFAULT '9999-12-31',
      source       TEXT DEFAULT 'import',
      created_at   TEXT DEFAULT (datetime('now','localtime')),
      UNIQUE (person_id, from_date)
    );
    CREATE INDEX IF NOT EXISTS idx_assign_person ON person_assignments(person_id, from_date);

    CREATE TABLE IF NOT EXISTS import_logs (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      type        TEXT NOT NULL,           -- org / metrics
      filename    TEXT,
      uploaded_at TEXT DEFAULT (datetime('now','localtime')),
      rows_ok     INTEGER NOT NULL DEFAULT 0,
      rows_failed INTEGER NOT NULL DEFAULT 0,
      report_json TEXT
    );

    -- v4.2 登录账号（与人员节点 emp_no 1:1 绑定；scope 按人员当前位置派生）
    CREATE TABLE IF NOT EXISTS users (
      id                     INTEGER PRIMARY KEY AUTOINCREMENT,
      emp_no                 TEXT NOT NULL UNIQUE,
      password_hash          TEXT NOT NULL,
      role                   TEXT NOT NULL,         -- hq / regional_lead / area_lead / store_lead / employee
      must_change_password   INTEGER NOT NULL DEFAULT 1,
      password_changed_at    TEXT,
      last_login_at          TEXT,
      failed_attempts        INTEGER NOT NULL DEFAULT 0,
      locked_until           TEXT,
      status                 TEXT NOT NULL DEFAULT 'active',   -- active / locked / disabled
      created_at             TEXT DEFAULT (datetime('now','localtime')),
      created_by             TEXT                       -- 创建者标识（CLI 账号或脚本名）
    );
    CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
    CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

    -- 元信息（schema 版本等）
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
  `);
  require('./services/actionScoring_v4.6').migrateScoring(db);   // v5 三表（懒引用避免循环依赖）
  // 旧库升级：逐列补列（已存在则忽略；CREATE TABLE IF NOT EXISTS 对已有库不生效，必须 ALTER）
  ['store_id INTEGER', 'status INTEGER NOT NULL DEFAULT 1', 'deactivated_at TEXT', 'emp_no TEXT']
    .forEach(col => { try { db.exec('ALTER TABLE org_nodes ADD COLUMN ' + col); } catch (e) { /* ignore */ } });
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_org_empno ON org_nodes(emp_no) WHERE emp_no IS NOT NULL AND level = '人员'");
  db.exec('CREATE INDEX IF NOT EXISTS idx_org_status ON org_nodes(level, status)');
  // 静态老表 → 带任职区间的分片表（旧行统一写成开放区间，语义等价 v3.8）
  upgradePathsToV4(db);
  if (Number(getMeta(db, 'schema_version') || 0) < SCHEMA_VERSION) {
    const tx = db.transaction(() => {
      backfillLegacy(db);       // 存量人员补一条开放任职段
      rebuildAllPaths(db);      // 由任职段派生路径 + 回填 store_id
      setMeta(db, 'schema_version', String(SCHEMA_VERSION));
    });
    tx();
  }
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

/** 在节点自身及其祖先中找到最近的门店节点 id（找不到返回 null） */
function findStoreIdInChain(db, nodeId) {
  if (!nodeId) return null;
  for (const id of ancestorChain(db, nodeId)) {
    const n = db.prepare('SELECT level FROM org_nodes WHERE id = ?').get(id);
    if (n && n.level === '门店') return id;
  }
  return null;
}

/** 闭区间端点工具：生效日 → 前一日（用于关闭旧任职段） */
function prevDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------- meta 表

function getMeta(db, key) {
  const r = db.prepare('SELECT value FROM meta WHERE key = ?').get(key);
  return r ? r.value : null;
}

function setMeta(db, key, value) {
  db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value')
    .run(key, String(value));
}

// ------------------------------------------------- 结构迁移（幂等）

/** 静态 node_paths → 带任职区间的分片表（旧行统一写开放区间 '1970-01-01'~'9999-12-31'，语义等价 v3.8） */
function upgradePathsToV4(db) {
  const cols = db.prepare('PRAGMA table_info(node_paths)').all();
  if (!cols.length) return;                     // 表不存在（正常不会发生，DDL 已保证）
  if (cols.some(c => c.name === 'from_date')) { // 已是 v4 结构
    db.exec('CREATE INDEX IF NOT EXISTS idx_paths_ancestor_date ON node_paths(ancestor_id, from_date)');
    return;
  }
  const tx = db.transaction(() => {
    db.exec('DROP TABLE IF EXISTS node_paths_v4');
    db.exec(`CREATE TABLE node_paths_v4 (
      person_id   INTEGER NOT NULL,
      ancestor_id INTEGER NOT NULL,
      from_date   TEXT NOT NULL DEFAULT '1970-01-01',
      to_date     TEXT NOT NULL DEFAULT '9999-12-31',
      store_id    INTEGER,
      post_key    TEXT,
      PRIMARY KEY (person_id, ancestor_id, from_date)
    )`);
    db.exec(`INSERT OR IGNORE INTO node_paths_v4 (person_id, ancestor_id, from_date, to_date, store_id, post_key)
             SELECT np.person_id, np.ancestor_id, '1970-01-01', '9999-12-31', pn.store_id, pn.post_key
             FROM node_paths np LEFT JOIN org_nodes pn ON pn.id = np.person_id`);
    db.exec('DROP TABLE node_paths');
    db.exec('ALTER TABLE node_paths_v4 RENAME TO node_paths');
    db.exec('CREATE INDEX IF NOT EXISTS idx_paths_ancestor_date ON node_paths(ancestor_id, from_date)');
  });
  tx();
  console.log('[db] node_paths 已升级为带任职区间的分片结构');
}

/** 存量回填：为尚无任职记录的人员补一条开放任职段（幂等，仅缺记录者处理） */
function backfillLegacy(db) {
  const persons = db.prepare("SELECT id, post_key, store_id, parent_id FROM org_nodes WHERE level = '人员'").all();
  const hasAny = db.prepare('SELECT 1 AS x FROM person_assignments WHERE person_id = ? LIMIT 1');
  const ins = db.prepare(`INSERT OR IGNORE INTO person_assignments
    (person_id, post_key, post_node_id, store_id, from_date, to_date, source)
    VALUES (?, ?, ?, ?, ?, ?, 'legacy')`);
  let n = 0;
  const tx = db.transaction(() => {
    for (const p of persons) {
      if (hasAny.get(p.id)) continue;
      if (!p.parent_id) continue;                       // 无岗位父节点，无法建路径
      const storeId = p.store_id || findStoreIdInChain(db, p.parent_id) || 0;
      ins.run(p.id, p.post_key || '', p.parent_id, storeId, OPEN_FROM, OPEN_TO);
      n++;
    }
  });
  tx();
  if (n) console.log(`[db] 已为 ${n} 名存量人员回填开放任职段`);
  return n;
}

// ------------------------------------------------- 节点状态与工号

/** 停用/恢复节点（软删除：只改状态，不删数据） */
function setNodeStatus(db, nodeId, status, when) {
  const st = status ? 1 : 0;
  const at = st ? null : (when || new Date().toISOString().slice(0, 10));
  db.prepare('UPDATE org_nodes SET status = ?, deactivated_at = ? WHERE id = ?').run(st, at, nodeId);
  return { nodeId, status: st, deactivatedAt: at };
}

/** 按工号查人员节点（工号唯一索引保证最多一条） */
function findPersonByEmpNo(db, empNo) {
  if (!empNo) return undefined;
  return db.prepare("SELECT * FROM org_nodes WHERE level = '人员' AND emp_no = ?").get(empNo);
}

function setPersonEmpNo(db, personId, empNo) {
  db.prepare("UPDATE org_nodes SET emp_no = ? WHERE id = ? AND level = '人员'").run(empNo || null, personId);
}

// ------------------------------------------------- 任职记录

/** 新增一条开放任职段（同 from_date 已存在时覆盖，保证 UNIQUE(person_id, from_date) 不冲突） */
function createAssignment(db, { personId, postKey, postNodeId, storeId, fromDate, source }) {
  db.prepare(`INSERT OR REPLACE INTO person_assignments
    (person_id, post_key, post_node_id, store_id, from_date, to_date, source)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(personId, postKey || '', postNodeId, storeId || 0, fromDate || OPEN_FROM, OPEN_TO, source || 'import');
}

/** 取该人当前开放段（to_date = 哨兵） */
function openAssignment(db, personId) {
  return db.prepare('SELECT * FROM person_assignments WHERE person_id = ? AND to_date = ? ORDER BY from_date DESC LIMIT 1')
    .get(personId, OPEN_TO);
}

/** 取该人最新任职段（不论是否已关闭） */
function latestAssignment(db, personId) {
  return db.prepare('SELECT * FROM person_assignments WHERE person_id = ? ORDER BY from_date DESC LIMIT 1').get(personId);
}

function personAssignments(db, personId) {
  return db.prepare('SELECT * FROM person_assignments WHERE person_id = ? ORDER BY from_date').all(personId);
}

/** 关闭开放段到 endDate（含）；若闭合日早于起始日则删除该空段，避免区间倒挂 */
function closeAssignmentAt(db, personId, endDate) {
  const open = openAssignment(db, personId);
  if (!open) return null;
  if (endDate < open.from_date) {
    db.prepare('DELETE FROM person_assignments WHERE id = ?').run(open.id);
    return { deleted: true, id: open.id };
  }
  db.prepare('UPDATE person_assignments SET to_date = ? WHERE id = ?').run(endDate, open.id);
  return { closed: true, id: open.id, toDate: endDate };
}

/** 迁移人员节点到新岗位/门店（不关闭任职段，调用方负责切段） */
function movePersonNode(db, personId, { postNodeId, postKey, storeId }) {
  db.prepare('UPDATE org_nodes SET parent_id = ?, post_key = ?, store_id = ?, status = 1, deactivated_at = NULL WHERE id = ?')
    .run(postNodeId, postKey || null, storeId === undefined ? null : storeId, personId);
}

/** 调岗：关闭旧段（生效日前一日）+ 开新段 + 迁移节点 + 重建路径，返回变更摘要 */
function transferPerson(db, { personId, postNodeId, postKey, storeId, fromDate, source }) {
  const summary = { personId, fromDate, from: null, to: { postKey, storeId } };
  closeAssignmentAt(db, personId, prevDate(fromDate));
  createAssignment(db, { personId, postKey, postNodeId, storeId, fromDate, source });
  movePersonNode(db, personId, { postNodeId, postKey, storeId });
  buildPersonPaths(db, personId);
  return summary;
}

// ------------------------------------------------- 物化路径（由任职段派生）

/** 按任职段重建某人的 node_paths（含自身行；每段携带当时门店/岗位） */
function buildPersonPaths(db, personId) {
  const segs = personAssignments(db, personId);
  db.prepare('DELETE FROM node_paths WHERE person_id = ?').run(personId);
  const ins = db.prepare(`INSERT OR REPLACE INTO node_paths
    (person_id, ancestor_id, from_date, to_date, store_id, post_key) VALUES (?, ?, ?, ?, ?, ?)`);
  let rows = 0;
  for (const s of segs) {
    ins.run(personId, personId, s.from_date, s.to_date, s.store_id, s.post_key); rows++;
    for (const aid of ancestorChain(db, s.post_node_id)) {
      ins.run(personId, aid, s.from_date, s.to_date, s.store_id, s.post_key); rows++;
    }
  }
  return { segments: segs.length, rows };
}

/**
 * 查找或创建组织节点，返回节点 id（幂等，导入/seed 共用）
 * 人员节点新建时自动补一条开放任职段（父节点即岗位节点）
 */
function findOrCreateNode(db, name, level, parentId, postKey) {
  const found = db.prepare(
    'SELECT id FROM org_nodes WHERE name = ? AND level = ? AND parent_id IS ?'
  ).get(name, level, parentId === null ? null : parentId);
  if (found) return found.id;
  const r = db.prepare(
    'INSERT INTO org_nodes (name, level, parent_id, post_key, status) VALUES (?, ?, ?, ?, 1)'
  ).run(name, level, parentId, postKey || null);
  const id = r.lastInsertRowid;
  if (level === '人员' && parentId) {
    const storeId = findStoreIdInChain(db, parentId) || 0;
    createAssignment(db, { personId: id, postKey, postNodeId: parentId, storeId, fromDate: OPEN_FROM, source: 'auto' });
  }
  return id;
}

/**
 * 强制新建人员节点：不做同名复用（工号权威场景专用）
 *
 * 用于「同一门店同一岗位存在同名但工号不同的两个人」——此时按姓名复用节点会把两人
 * 静默合并、并覆盖前者的工号，造成身份与历史数据错乱。有工号且库中无该工号时一律新建。
 * 同时补一条开放任职段，与 findOrCreateNode 保持一致。
 */
function createPersonNode(db, name, parentId, postKey, storeId) {
  const sid = storeId || findStoreIdInChain(db, parentId) || 0;
  const r = db.prepare(
    'INSERT INTO org_nodes (name, level, parent_id, post_key, status, store_id) VALUES (?, ?, ?, ?, 1, ?)'
  ).run(name, '人员', parentId, postKey || null, sid || null);
  const id = r.lastInsertRowid;
  createAssignment(db, { personId: id, postKey, postNodeId: parentId, storeId: sid, fromDate: OPEN_FROM, source: 'import' });
  return id;
}

/** 全量重建 node_paths 与 org_nodes.store_id（迁移/修复用；日常增量请用 refreshPersonPaths） */
function rebuildAllPaths(db) {
  const persons = db.prepare("SELECT id FROM org_nodes WHERE level = '人员'").all();
  const levelById = new Map(db.prepare('SELECT id, level FROM org_nodes').all().map(r => [r.id, r.level]));
  const setStore = db.prepare('UPDATE org_nodes SET store_id = ? WHERE id = ?');
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM node_paths').run();
    for (const p of persons) {
      buildPersonPaths(db, p.id);
      const seg = latestAssignment(db, p.id);
      setStore.run(seg ? seg.store_id : (findStoreIdInChain(db, p.id) || null), p.id);
    }
    // 岗位节点同样回填 store_id（其子节点即人员）
    const posts = db.prepare("SELECT id FROM org_nodes WHERE level = '岗位'").all();
    for (const pn of posts) {
      const chain = ancestorChain(db, pn.id);
      setStore.run(chain.find(aid => levelById.get(aid) === '门店') || null, pn.id);
    }
  });
  tx();
  const rows = db.prepare('SELECT COUNT(*) AS c FROM node_paths').get().c;
  return { persons: persons.length, paths: rows };
}

module.exports = {
  DB_PATH, DATA_DIR, METRIC_COLS, METRIC_KEYS, DEFAULT_PW, DEFAULT_POSTS,
  SCHEMA_VERSION, OPEN_FROM, OPEN_TO,
  openDb, findOrCreateNode, ancestorChain, findStoreIdInChain, prevDate,
  refreshPersonPaths: buildPersonPaths, buildPersonPaths, rebuildAllPaths,
  getMeta, setMeta,
  setNodeStatus, findPersonByEmpNo, setPersonEmpNo, createPersonNode,
  createAssignment, openAssignment, latestAssignment, personAssignments, closeAssignmentAt, movePersonNode, transferPerson
};
