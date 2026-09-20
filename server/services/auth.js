'use strict';
/**
 * v4.2 鉴权核心：密码 hash、JWT 签发/校验、scope 派生（基于当前人员节点）
 *
 * 设计要点
 * - role 存于 users 表；scope_root_id 按当前人员节点位置每次实时计算（调岗/晋升后下次请求即生效）
 * - hq 角色授予全树访问（scope_root_id=null），其他角色按 person.id 子树
 * - JWT payload 只放轻量字段（uid/emp_no/role/scope_root_id/iat/exp），后代 ID 在中间件 SQL 现算
 * - 登录失败统一返回 AUTH_INVALID 防账号枚举；锁定仅记 failed_attempts（v4.2 不做自动锁定）
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// 安全告警：未设置 JWT_SECRET 时打印警告并使用一次性随机值（保证重启不会续签伪造 token）
let JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  JWT_SECRET = crypto.randomBytes(48).toString('hex');
  console.warn('[security] JWT_SECRET 未设置，已使用本次启动随机值——重启后所有 token 将失效，请立即设置环境变量');
}
// v5.1 鉴权模式开关：password = 工号+密码（默认，完整链路）；emp_only = 仅工号（免密码试用推广，token 默认缩短为 2h）
const AUTH_MODE = String(process.env.AUTH_MODE || '').trim().toLowerCase() === 'emp_only' ? 'emp_only' : 'password';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || (AUTH_MODE === 'emp_only' ? '2h' : '8h');
const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS || 12);

const ROLE_LEVEL_MAP = {
  hq: null,             // null = 不绑定具体节点，授予全树
  regional_lead: '大区',
  area_lead: '小区',
  store_lead: '门店',
  employee: '人员'
};

async function hashPassword(plain) {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

/** 随机密码（10 位，去掉易混字符 0/O/1/l/I），用于 CLI 建账号一次性输出 */
function randomPassword(len) {
  const n = len || 10;
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(n);
  let s = '';
  for (let i = 0; i < n; i++) s += chars[bytes[i] % chars.length];
  return s;
}

function loadUserByEmpNo(db, empNo) {
  return db.prepare('SELECT * FROM users WHERE emp_no = ?').get(empNo);
}

function findPersonByEmpNo(db, empNo) {
  return db.prepare(
      "SELECT id, name, level, store_id, parent_id, status FROM org_nodes WHERE emp_no = ? AND level = '人员'"
    ).get(empNo);
}

/** 从人员向上找指定 level 的祖先节点；找不到返回 null（用于角色 role→scope 派生） */
function ancestorOfLevel(db, personId, level) {
  const stmt = db.prepare('SELECT id, level, parent_id FROM org_nodes WHERE id = ?');
  let cur = stmt.get(personId);
  while (cur) {
    if (cur.level === level) return cur.id;
    if (cur.parent_id === null) return null;
    cur = stmt.get(cur.parent_id);
  }
  return null;
}

/** scope 根节点 ID：scope_level=null（hq）→ null（全树）；其他按角色取祖先节点（大区/小区/门店/人员自己） */
function scopeRootForRole(db, person, role) {
  const roleInfo = loadRole(db, role);
  if (roleInfo.scopeLevel === null) return null;            // 全树角色（hq）
  if (!person) return null;
  const expect = roleInfo.scopeLevel;                        // '大区'/'小区'/'门店'/'人员'
  if (!expect) return person.id;                             // 未知角色兜底：仅本人（不越权）
  // 员工直接看自己；其他角色向上找所属大区/小区/门店
  if (expect === '人员') return person.id;
  const ancId = ancestorOfLevel(db, person.id, expect);
  return ancId !== null ? ancId : person.id;   // 兜底：找不到祖先就退回本人（保底，至少不越权）
}

/** v5.2 角色加载：查 roles 表；查不到回退 ROLE_LEVEL_MAP（scope_level）+ 空权限集 */
function loadRole(db, roleCode) {
  if (roleCode === 'hq') {   // 快速路径，也是保底：hq 永远全树全权限
    return { code: 'hq', name: '总部管理员', scopeLevel: null, permissions: { '*': true }, builtIn: true };
  }
  const row = db.prepare('SELECT code, name, scope_level, permissions, built_in FROM roles WHERE code = ?').get(roleCode);
  if (row) {
    let perms = {};
    try { perms = JSON.parse(row.permissions) || {}; } catch (e) { /* 损坏按空处理 */ }
    return { code: row.code, name: row.name, scopeLevel: row.scope_level, permissions: perms, builtIn: !!row.built_in };
  }
  // 回退：roles 表缺行（老库未 seed / 手工删行），按内置映射保底
  const has = Object.prototype.hasOwnProperty.call(ROLE_LEVEL_MAP, roleCode);
  return { code: roleCode, name: roleCode, scopeLevel: has ? ROLE_LEVEL_MAP[roleCode] : undefined, permissions: {}, builtIn: false, missing: true };
}

/** v5.2 权限点判断：hq 恒真；permissions 支持 JSON 数组（seed 格式）与对象两种形态 */
function hasPerm(db, role, perm) {
  const roleInfo = loadRole(db, role);
  if (roleInfo.code === 'hq') return true;
  const perms = roleInfo.permissions;
  if (Array.isArray(perms)) return perms.indexOf(perm) >= 0;
  if (perms && typeof perms === 'object') return !!perms[perm];
  return false;
}

/** v5.2 按业务路径解析节点："华东大区/上海一区/门店一"（首段可写可不写"全国"；找不到返回 {err, hint}）
 *  也支持直接传节点数字 id */
function resolveNodePath(db, spec) {
  spec = String(spec).trim();
  if (/^\d+$/.test(spec)) {
    const n = db.prepare('SELECT id, name, level FROM org_nodes WHERE id = ?').get(Number(spec));
    return n ? { id: n.id, name: n.name, level: n.level } : { err: '节点 id 不存在: ' + spec };
  }
  const parts = spec.split(/[\/\\]/).map(s => s.trim()).filter(Boolean);
  if (!parts.length) return { err: '节点路径为空' };
  const topLevel = db.prepare('SELECT id, name FROM org_nodes WHERE parent_id IS NULL ORDER BY id LIMIT 1').get();
  let parentId = null, node = null, idx = 0;
  if (topLevel && parts[0] === topLevel.name) { parentId = topLevel.id; idx = 1; }
  if (idx === 0 && topLevel) {
    const reg = db.prepare('SELECT id, name, level FROM org_nodes WHERE name = ? AND parent_id = ?').get(parts[0], topLevel.id);
    if (reg) { node = reg; parentId = reg.id; idx = 1; }
  }
  for (; idx < parts.length; idx++) {
    const seg = parts[idx];
    const row = db.prepare('SELECT id, name, level FROM org_nodes WHERE name = ? AND parent_id = ?').get(seg, parentId);
    if (!row) {
      const sibs = db.prepare('SELECT name FROM org_nodes WHERE parent_id = ?').all(parentId).map(r => r.name).slice(0, 12);
      return { err: '找不到「' + seg + '」' + (sibs.length ? '；该层级现有: ' + sibs.join('、') : '') };
    }
    node = row; parentId = row.id;
  }
  if (!node) return { err: '路径仅含根节点，请至少写到大区/小区/门店一级' };
  return { id: node.id, name: node.name, level: node.level };
}

/** 用 WITH RECURSIVE CTE 计算某节点的全部后代（含自身）；rootId=null 时返回全库 */
function descendantsOf(db, rootId) {
  if (rootId === null || rootId === undefined) {
    return db.prepare('SELECT id FROM org_nodes').all().map(function (r) { return r.id; });
  }
  const rows = db.prepare(`
    WITH RECURSIVE sub(id) AS (
      SELECT id FROM org_nodes WHERE id = ?
      UNION ALL
      SELECT c.id FROM org_nodes c JOIN sub s ON c.parent_id = s.id
    ) SELECT id FROM sub
  `).all(rootId);
  return rows.map(function (r) { return r.id; });
}

/** v5.2 多根后代并集：一次 CTE 递归算多棵子树的并集（含各根自身） */
function descendantsMulti(db, rootIds) {
  if (!rootIds || !rootIds.length) return [];
  if (rootIds.length === 1) return descendantsOf(db, rootIds[0]);
  const ph = rootIds.map(function () { return '?'; }).join(',');
  const stmt = db.prepare(`
    WITH RECURSIVE sub(id) AS (
      SELECT DISTINCT id FROM org_nodes WHERE id IN (${ph})
      UNION ALL
      SELECT c.id FROM org_nodes c JOIN sub s ON c.parent_id = s.id
    ) SELECT DISTINCT id FROM sub
  `);
  const rows = stmt.all.apply(stmt, rootIds);
  return rows.map(function (r) { return r.id; });
}

/** v5.2 查某用户的显式授权记录（JOIN 节点名与层级，供展示与计算共用） */
function scopeGrantsOf(db, userId) {
  return db.prepare(`
    SELECT usn.node_id, usn.mode, n.name, n.level, n.parent_id
    FROM user_scope_nodes usn JOIN org_nodes n ON n.id = usn.node_id
    WHERE usn.user_id = ?
    ORDER BY usn.mode, n.name
  `).all(userId);
}

/** v5.2 显式模式展示名："名称A+名称B（除 名称C）"；include 超 2 个显示"名称A 等 N 个节点" */
function scopeLabelMulti(db, grants) {
  const inc = grants.filter(function (g) { return g.mode === 'include'; });
  const exc = grants.filter(function (g) { return g.mode === 'exclude'; });
  if (!inc.length) return '（显式清空：当前无任何数据权限）';
  let label;
  if (inc.length === 1) label = inc[0].name;
  else if (inc.length === 2) label = inc[0].name + '+' + inc[1].name;
  else label = inc[0].name + ' 等 ' + inc.length + ' 个节点';
  if (exc.length) {
    label += '（除 ' + (exc.length === 1 ? exc[0].name : exc.length + ' 个节点') + '）';
  }
  return label;
}

/**
 * v5.2 有效数据范围（每请求实时计算，改授权/调岗下次请求即生效）：
 *   full     全树角色（hq）
 *   auto     无显式授权 → 沿人员位置单根派生（v5.1 原行为）
 *   explicit 有显式授权 → UNION(include 子树) − UNION(exclude 子树)
 * 返回 { mode, scopeRootId, scopeNodeIds, scopeName, grants? }
 */
function effectiveScope(db, user) {
  const roleInfo = loadRole(db, user.role);
  if (roleInfo.scopeLevel === null) {
    return { mode: 'full', scopeRootId: null, scopeNodeIds: descendantsOf(db, null), scopeName: '全国（全树）' };
  }
  const grants = scopeGrantsOf(db, user.id);
  if (!grants.length) {
    const person = findPersonByEmpNo(db, user.emp_no);
    const rootId = scopeRootForRole(db, person, user.role);
    return { mode: 'auto', scopeRootId: rootId, scopeNodeIds: descendantsOf(db, rootId), scopeName: scopeLabelOf(db, user.role, rootId) };
  }
  // 显式模式：并集减排除
  const incIds = grants.filter(function (g) { return g.mode === 'include'; }).map(function (g) { return g.node_id; });
  const excIds = grants.filter(function (g) { return g.mode === 'exclude'; }).map(function (g) { return g.node_id; });
  const allowed = new Set(descendantsMulti(db, incIds));
  for (const exId of excIds) {
    for (const nid of descendantsOf(db, exId)) allowed.delete(nid);
  }
  return {
    mode: 'explicit',
    scopeRootId: null,
    scopeNodeIds: Array.from(allowed),
    scopeName: scopeLabelMulti(db, grants),
    includeIds: incIds,
    excludeIds: excIds,
    grants: grants
  };
}

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

function verifyToken(token) {
  try { return jwt.verify(token, JWT_SECRET); } catch (e) { return null; }
}

/** 数据范围展示名（login 与 /api/auth/me 共用，避免两处口径不一致）：hq=全国（全树）；其余取 scope 根节点名 */
function scopeLabelOf(db, role, scopeRootId) {
  if (role === 'hq') return '全国（全树）';
  if (scopeRootId === null || scopeRootId === undefined) return '（人员未导入）';
  const n = db.prepare('SELECT name, level FROM org_nodes WHERE id = ?').get(scopeRootId);
  return n ? (n.name + (n.level === role ? '' : '（' + n.level + '）')) : '（未知节点）';
}

/**
 * 登录：bcrypt 比对密码 → 加载人员 → 派生 scope_root_id → 签发 JWT
 * 统一错误：账号不存在/密码错误均抛 AUTH_INVALID（防枚举）
 */
async function login(db, empNo, password) {
  if (!empNo) throw new Error('AUTH_INVALID');
  if (AUTH_MODE === 'password' && !password) throw new Error('AUTH_INVALID');
  const user = loadUserByEmpNo(db, String(empNo).trim());
  if (!user || user.status !== 'active') throw new Error('AUTH_INVALID');
  if (user.locked_until && new Date(user.locked_until) > new Date()) throw new Error('AUTH_LOCKED');
  if (AUTH_MODE === 'password') {   // v5.1：emp_only 模式跳过密码比对（仅凭工号识别身份，无认证强度）
    const ok = await verifyPassword(password, user.password_hash);
    if (!ok) {
      db.prepare('UPDATE users SET failed_attempts = failed_attempts + 1 WHERE id = ?').run(user.id);
      throw new Error('AUTH_INVALID');
    }
  }
  const person = findPersonByEmpNo(db, user.emp_no);
  const scope = effectiveScope(db, user);   // v5.2：含显式授权的多根范围
  const token = signToken({
    uid: user.id,
    emp_no: user.emp_no,
    role: user.role,
    scope_root_id: scope.scopeRootId
  });
  // 登录成功：清失败计数 + 更新 last_login
  db.prepare("UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login_at = datetime('now','localtime') WHERE id = ?").run(user.id);
  return {
    token: token,
    user: {
      id: user.id,
      emp_no: user.emp_no,
      name: person ? person.name : user.emp_no,
      role: user.role,
      scopeName: scope.scopeName,
      scopeRootId: scope.scopeRootId,
      scopeMode: scope.mode
    },
    mustChangePassword: AUTH_MODE === 'password' ? !!user.must_change_password : false
  };
}

/** 改密：校验旧密码 → bcrypt 新密码 → 清 must_change_password → 签发新 token（刷新 scope） */
async function changePassword(db, userId, oldPassword, newPassword) {
  if (!oldPassword || !newPassword || newPassword.length < 6) throw new Error('AUTH_BAD_NEW_PASSWORD');
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) throw new Error('AUTH_INVALID');
  const ok = await verifyPassword(oldPassword, user.password_hash);
  if (!ok) throw new Error('AUTH_OLD_PASSWORD');
  const newHash = await hashPassword(newPassword);
  db.prepare(
    "UPDATE users SET password_hash = ?, must_change_password = 0, password_changed_at = datetime('now','localtime'), failed_attempts = 0, locked_until = NULL WHERE id = ?"
  ).run(newHash, user.id);
  const person = findPersonByEmpNo(db, user.emp_no);
  const scopeRootId = scopeRootForRole(db, person, user.role);
  return signToken({ uid: user.id, emp_no: user.emp_no, role: user.role, scope_root_id: scopeRootId });
}

/** 公开当前登录者资料（供 /api/auth/me 使用，每次实时刷新 scope 以反映调岗/授权变更） */
function meOf(db, payload) {
  const user = loadUserByEmpNo(db, payload.emp_no);
  if (!user) return null;
  const person = findPersonByEmpNo(db, user.emp_no);
  const scope = effectiveScope(db, user);
  return {
    id: user.id,
    emp_no: user.emp_no,
    name: person ? person.name : user.emp_no,
    role: user.role,
    scopeName: scope.scopeName,
    scopeRootId: scope.scopeRootId,
    scopeMode: scope.mode,
    // emp_only 免密模式下跳过强制改密（与登录接口口径一致）
    mustChangePassword: AUTH_MODE === 'password' ? !!user.must_change_password : false,
    lastLoginAt: user.last_login_at
  };
}

module.exports = {
  AUTH_MODE: AUTH_MODE,
  hashPassword: hashPassword,
  verifyPassword: verifyPassword,
  randomPassword: randomPassword,
  loadUserByEmpNo: loadUserByEmpNo,
  findPersonByEmpNo: findPersonByEmpNo,
  loadRole: loadRole,
  hasPerm: hasPerm,
  resolveNodePath: resolveNodePath,
  scopeRootForRole: scopeRootForRole,
  descendantsOf: descendantsOf,
  descendantsMulti: descendantsMulti,
  scopeGrantsOf: scopeGrantsOf,
  effectiveScope: effectiveScope,
  login: login,
  changePassword: changePassword,
  meOf: meOf,
  signToken: signToken,
  verifyToken: verifyToken,
  ROLE_LEVEL_MAP: ROLE_LEVEL_MAP
};