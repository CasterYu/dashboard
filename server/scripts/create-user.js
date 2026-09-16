#!/usr/bin/env node
'use strict';
/**
 * v4.2 账号管理 CLI（npm run users）
 *
 * 用法：
 *   node scripts/create-user.js add <emp_no> [role] [--password <plain>] [--note <text>]
 *       role: hq | regional_lead | area_lead | store_lead | employee  (默认根据 emp_no 查找的人员节点 level 自动推断)
 *       不传 --password 时自动生成 10 位随机密码并打印（仅此次显示，管理员线下分发）
 *
 *   node scripts/create-user.js reset <emp_no> [--password <plain>]
 *       重置密码（清 failed_attempts 与 locked_until）
 *
 *   node scripts/create-user.js list
 *       列出全部账号（仅 emp_no / role / status / last_login_at，不显示密码）
 *
 *   node scripts/create-user.js import <json|csv>
 *       JSON 格式：[{ emp_no, role, note? }] （password 字段缺省时自动生成）
 *       CSV 格式：emp_no,role,note (首行为表头)
 *
 *   node scripts/create-user.js disable <emp_no>   /   enable <emp_no>
 *
 * 约定：
 *   - 必须在 server 目录下执行（与 db.js 一致，确保数据库路径正确）
 *   - 已存在 emp_no 的账号：add 操作会报错；reset/disable/enable 直接生效
 *   - role 与人员节点 level 不一致时，scope 派生在登录时按 level 推断（收紧到 person 子树）；不会越权
 */

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { openDb } = require('../db');
const { hashPassword, randomPassword, findPersonByEmpNo, ROLE_LEVEL_MAP } = require('../services/auth');

const ROLES = Object.keys(ROLE_LEVEL_MAP);   // hq / regional_lead / area_lead / store_lead / employee

function die(msg) { console.error('[create-user] ' + msg); process.exit(1); }

function parseArgs(argv) {
  const out = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) { out.flags[a.slice(2)] = argv[++i]; }
    else out._.push(a);
  }
  return out;
}

function inferRoleByLevel(level) {
  if (level === '大区') return 'regional_lead';
  if (level === '小区') return 'area_lead';
  if (level === '门店') return 'store_lead';
  if (level === '人员') return 'employee';
  return null;
}

async function cmdAdd(db, args) {
  const [emp_no, roleArg] = args._;
  if (!emp_no) die('用法：add <emp_no> [role] [--password <plain>] [--note <text>]');
  const existing = db.prepare('SELECT id FROM users WHERE emp_no = ?').get(emp_no);
  if (existing) die('账号已存在：' + emp_no + '（如需重置密码请用 reset 子命令）');
  const person = findPersonByEmpNo(db, emp_no);
  let role = roleArg;
  if (!role) {
    if (!person) die('未指定 role 且未找到工号 ' + emp_no + ' 对应的人员；请明确指定 role 或先导入名册');
    role = inferRoleByLevel(person.level);
    if (!role) die('人员节点 level=' + person.level + ' 无法推断 role，请明确指定');
    console.log('[create-user] 自动推断 role=' + role + '（人员 level=' + person.level + '）');
  } else if (!ROLES.includes(role)) {
    die('role 非法，可选：' + ROLES.join(' / '));
  }
  if (role !== 'hq' && !person) die('role=' + role + ' 需要工号对应的人员节点已导入；请先导入名册');
  const password = args.flags.password || randomPassword(10);
  const note = args.flags.note || 'cli-add';
  const hash = await hashPassword(password);
  db.prepare(
    'INSERT INTO users (emp_no, password_hash, role, must_change_password, status, created_by) VALUES (?, ?, ?, 1, ?, ?)'
  ).run(emp_no, hash, role, 'active', note);
  console.log('[create-user] OK emp_no=' + emp_no + ' role=' + role);
  console.log('[create-user] 初始密码（仅显示一次，请线下安全分发）：' + password);
}

async function cmdReset(db, args) {
  const [emp_no] = args._;
  if (!emp_no) die('用法：reset <emp_no> [--password <plain>]');
  const user = db.prepare('SELECT id FROM users WHERE emp_no = ?').get(emp_no);
  if (!user) die('账号不存在：' + emp_no);
  const password = args.flags.password || randomPassword(10);
  const hash = await hashPassword(password);
  db.prepare(
    "UPDATE users SET password_hash = ?, must_change_password = 1, password_changed_at = NULL, failed_attempts = 0, locked_until = NULL, status = 'active' WHERE id = ?"
  ).run(hash, user.id);
  console.log('[create-user] 已重置密码 emp_no=' + emp_no);
  console.log('[create-user] 新密码（仅显示一次）：' + password);
}

function cmdList(db) {
  const rows = db.prepare(
    'SELECT u.emp_no, u.role, u.status, u.must_change_password, u.last_login_at, u.created_at, n.name AS person_name FROM users u LEFT JOIN org_nodes n ON n.emp_no = u.emp_no AND n.level = \'人员\' ORDER BY u.role, u.emp_no'
  ).all();
  if (!rows.length) { console.log('[create-user] 当前无账号'); return; }
  console.log('emp_no'.padEnd(10) + 'role'.padEnd(16) + 'person_name'.padEnd(14) + 'status'.padEnd(10) + 'mustChange'.padEnd(10) + 'lastLogin');
  rows.forEach(r => {
    console.log(
      String(r.emp_no).padEnd(10) +
      String(r.role).padEnd(16) +
      String(r.person_name || '-').padEnd(14) +
      String(r.status).padEnd(10) +
      String(r.must_change_password).padEnd(10) +
      String(r.last_login_at || '-')
    );
  });
}

function parseCsv(text) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];
  const head = lines[0].split(',').map(s => s.trim());
  return lines.slice(1).map(line => {
    const cells = line.split(',').map(s => s.trim());
    const o = {};
    head.forEach((h, i) => { o[h] = cells[i]; });
    return o;
  });
}

async function cmdImport(db, args) {
  const [, file] = args._;
  if (!file) die('用法：import <json|csv>');
  if (!fs.existsSync(file)) die('文件不存在：' + file);
  const text = fs.readFileSync(file, 'utf8');
  let records;
  if (file.endsWith('.json')) {
    records = JSON.parse(text);
    if (!Array.isArray(records)) die('JSON 必须是数组');
  } else if (file.endsWith('.csv')) {
    records = parseCsv(text);
  } else {
    die('仅支持 .json 或 .csv 文件');
  }
  let ok = 0, skip = 0, fail = 0;
  for (const r of records) {
    if (!r.emp_no) { console.warn('[create-user] 跳过：缺 emp_no'); fail++; continue; }
    const existing = db.prepare('SELECT id FROM users WHERE emp_no = ?').get(r.emp_no);
    if (existing) { console.log('[create-user] 已存在，跳过：' + r.emp_no); skip++; continue; }
    const person = findPersonByEmpNo(db, r.emp_no);
    let role = r.role;
    if (!role) {
      if (!person) { console.warn('[create-user] 跳过：' + r.emp_no + ' 未指定 role 且未找到人员'); fail++; continue; }
      role = inferRoleByLevel(person.level);
    }
    if (!ROLES.includes(role)) { console.warn('[create-user] 跳过：' + r.emp_no + ' role 非法 ' + role); fail++; continue; }
    if (role !== 'hq' && !person) { console.warn('[create-user] 跳过：' + r.emp_no + ' 人员未导入'); fail++; continue; }
    const password = r.password || randomPassword(10);
    const hash = await hashPassword(password);
    db.prepare(
      'INSERT INTO users (emp_no, password_hash, role, must_change_password, status, created_by) VALUES (?, ?, ?, 1, ?, ?)'
    ).run(r.emp_no, hash, role, 'active', r.note || 'cli-import');
    console.log('[create-user] OK emp_no=' + r.emp_no + ' role=' + role + ' 密码：' + password);
    ok++;
  }
  console.log('[create-user] 完成：ok=' + ok + ' skip=' + skip + ' fail=' + fail);
}

function cmdSetStatus(db, args, status) {
  const [emp_no] = args._;
  if (!emp_no) die('用法：' + (status === 'active' ? 'enable' : 'disable') + ' <emp_no>');
  const r = db.prepare("UPDATE users SET status = ? WHERE emp_no = ?").run(status, emp_no);
  if (!r.changes) die('账号不存在：' + emp_no);
  console.log('[create-user] 已将 ' + emp_no + ' status -> ' + status);
}

(async function main() {
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  const args = parseArgs(argv.slice(1));
  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
    console.log('用法：node scripts/create-user.js <add|reset|list|import|disable|enable> [...]');
    process.exit(0);
  }
  const db = openDb();
  try {
    if (cmd === 'add') await cmdAdd(db, args);
    else if (cmd === 'reset') await cmdReset(db, args);
    else if (cmd === 'list') cmdList(db);
    else if (cmd === 'import') await cmdImport(db, args);
    else if (cmd === 'disable') cmdSetStatus(db, args, 'disabled');
    else if (cmd === 'enable') cmdSetStatus(db, args, 'active');
    else die('未知子命令：' + cmd);
  } finally {
    db.close();
  }
})().catch(e => { console.error('[create-user] 异常：', e.message); process.exit(1); });