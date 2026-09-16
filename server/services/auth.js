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
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';
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

/** scope 根节点 ID：hq=null（全树）；其他按角色取祖先节点（region→大区 / area→小区 / store→门店 / employee→人员自己） */
function scopeRootForRole(db, person, role) {
  if (role === 'hq') return null;
  if (!person) return null;
  const expect = ROLE_LEVEL_MAP[role];   // '大区'/'小区'/'门店'/'人员'/null
  if (!expect) return null;
  // 员工直接看自己；其他角色向上找所属大区/小区/门店
  if (role === 'employee') return person.id;
  const ancId = ancestorOfLevel(db, person.id, expect);
  return ancId !== null ? ancId : person.id;   // 兜底：找不到祖先就退回本人（保底，至少不越权）
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
  if (!empNo || !password) throw new Error('AUTH_INVALID');
  const user = loadUserByEmpNo(db, String(empNo).trim());
  if (!user || user.status !== 'active') throw new Error('AUTH_INVALID');
  if (user.locked_until && new Date(user.locked_until) > new Date()) throw new Error('AUTH_LOCKED');
  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) {
    db.prepare('UPDATE users SET failed_attempts = failed_attempts + 1 WHERE id = ?').run(user.id);
    throw new Error('AUTH_INVALID');
  }
  const person = findPersonByEmpNo(db, user.emp_no);
  const scopeRootId = scopeRootForRole(db, person, user.role);
  const token = signToken({
    uid: user.id,
    emp_no: user.emp_no,
    role: user.role,
    scope_root_id: scopeRootId
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
      scopeName: scopeLabelOf(db, user.role, scopeRootId),
      scopeRootId: scopeRootId
    },
    mustChangePassword: !!user.must_change_password
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

/** 公开当前登录者资料（供 /api/auth/me 使用，每次实时刷新 scope 以反映调岗） */
function meOf(db, payload) {
  const user = loadUserByEmpNo(db, payload.emp_no);
  if (!user) return null;
  const person = findPersonByEmpNo(db, user.emp_no);
  const scopeRootId = scopeRootForRole(db, person, user.role);
  const scopeName = scopeLabelOf(db, user.role, scopeRootId);
  return {
    id: user.id,
    emp_no: user.emp_no,
    name: person ? person.name : user.emp_no,
    role: user.role,
    scopeName: scopeName,
    scopeRootId: scopeRootId,
    mustChangePassword: !!user.must_change_password,
    lastLoginAt: user.last_login_at
  };
}

module.exports = {
  hashPassword: hashPassword,
  verifyPassword: verifyPassword,
  randomPassword: randomPassword,
  loadUserByEmpNo: loadUserByEmpNo,
  findPersonByEmpNo: findPersonByEmpNo,
  scopeRootForRole: scopeRootForRole,
  descendantsOf: descendantsOf,
  login: login,
  changePassword: changePassword,
  meOf: meOf,
  signToken: signToken,
  verifyToken: verifyToken,
  ROLE_LEVEL_MAP: ROLE_LEVEL_MAP
};