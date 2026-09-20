#!/usr/bin/env node
'use strict';
/**
 * v5.2 权限管理 CLI（傻瓜式双模式）
 *
 * 【交互菜单模式】不带任何参数运行（推荐，双击 权限管理_v5.2.bat 即进入）：
 *   node scripts/manage-scope_v5.2.js
 *
 * 【命令模式】（会复制粘贴的人用）：
 *   node scripts/manage-scope_v5.2.js list                       全员权限一览
 *   node scripts/manage-scope_v5.2.js list --emp E90001          某人授权明细
 *   node scripts/manage-scope_v5.2.js set  --emp E90001 --nodes "A大区/a小区,A大区/c小区/门店三" [--exclude "A大区/b小区"]
 *                                                                 整体替换（先清后写）
 *   node scripts/manage-scope_v5.2.js add  --emp E90001 --nodes "B大区/e小区/门店四" [--exclude ...]
 *                                                                 追加授权
 *   node scripts/manage-scope_v5.2.js remove --emp E90001 --nodes "A大区/a小区"
 *                                                                 收回指定授权
 *   node scripts/manage-scope_v5.2.js clear --emp E90001         清空授权，回到"按组织位置自动算"
 *   node scripts/manage-scope_v5.2.js role list                  角色一览
 *   node scripts/manage-scope_v5.2.js role add supervisor 督导 --level 小区 --perms dashboard.view
 *   node scripts/manage-scope_v5.2.js role del supervisor
 *
 * 节点写法：斜杠路径 "A大区/a小区/门店一"（像文件夹一样，从大区写到门店）；也可直接写节点数字 id。
 * 变更即时生效：被改授权的人刷新看板页面即可（无需重登、无需重启后端）。
 * 留痕：全部变更追加写入 logs/scope_changes_v5.2.log（时间 + 操作 + 工号 + 节点）。
 */

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { openDb } = require('../db');
const { effectiveScope, loadRole, descendantsOf, resolveNodePath } = require('../services/auth');

const LEVEL_DEPTH = { '全国': 0, '大区': 1, '小区': 2, '门店': 3, '岗位': 4, '人员': 5 };
const KNOWN_PERMS = ['dashboard.view', 'admin.dataQuality', 'metrics.fullTree', 'admin.userManage', 'roles.manage'];
const LOG_FILE = path.join(__dirname, '..', 'logs', 'scope_changes_v5.2.log');

function die(msg) { console.error('[manage-scope] ' + msg); process.exit(1); }

function logChange(line) {
  try {
    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
    fs.appendFileSync(LOG_FILE, '[' + new Date().toLocaleString() + '] ' + line + '\n', 'utf8');
  } catch (e) { /* 日志失败不阻断主流程 */ }
}

function parseArgs(argv) {
  const out = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) { out.flags[a.slice(2)] = argv[++i]; }
    else out._.push(a);
  }
  return out;
}

/** 按路径解析节点：共享实现（"华东大区/上海一区/门店一"，首段可省略"全国"；找不到附候选建议） */
function resolveNode(db, spec) {
  const r = resolveNodePath(db, spec);
  if (r.err) return r;
  return { id: r.id, name: r.name, level: r.level };
}

/** 授权倒挂校验：节点层级必须深于等于角色管辖层级（店长不能授小区，防越权） */
function validateGrantLevel(db, role, nodeLevel) {
  const roleInfo = loadRole(db, role);
  if (roleInfo.scopeLevel === null) return { ok: true };
  const need = LEVEL_DEPTH[roleInfo.scopeLevel], got = LEVEL_DEPTH[nodeLevel];
  if (need === undefined || got === undefined) return { ok: false, error: '未知层级: ' + nodeLevel };
  if (got < need) {
    return { ok: false, error: '「' + (roleInfo.name || role) + '」管辖层级为' + roleInfo.scopeLevel +
      '，不能授予' + nodeLevel + '层级节点（防倒挂越权）' };
  }
  return { ok: true };
}

/** 解析逗号分隔的多个节点；返回 { nodes } 或 { error } */
function resolveNodeList(db, specStr) {
  if (!specStr || !String(specStr).trim()) return { nodes: [] };
  const specs = String(specStr).split(/[,，;；]/).map(s => s.trim()).filter(Boolean);
  const nodes = [], seen = new Set();
  for (const s of specs) {
    const r = resolveNode(db, s);
    if (r.err) return { error: r.err };
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    nodes.push(r);
  }
  return { nodes: nodes };
}

function loadUser(db, empNo) {
  const u = db.prepare('SELECT id, emp_no, role, status FROM users WHERE emp_no = ?').get(String(empNo).trim());
  if (!u) die('账号不存在: ' + empNo + '（提示：先用 npm run users add 建账号）');
  return u;
}

function writeGrants(db, user, grants, operator) {
  const del = db.prepare('DELETE FROM user_scope_nodes WHERE user_id = ?');
  const ins = db.prepare('INSERT OR IGNORE INTO user_scope_nodes (user_id, node_id, mode) VALUES (?, ?, ?)');
  const tx = db.transaction(function () {
    del.run(user.id);
    grants.forEach(g => ins.run(user.id, g.id, g.mode));
  });
  tx();
  logChange('set 操作者=' + operator + ' 目标=' + user.emp_no + ' 节点=' +
    grants.map(g => g.mode + ':' + g.name).join(' | '));
}

function appendGrants(db, user, grants, operator) {
  const ins = db.prepare('INSERT OR IGNORE INTO user_scope_nodes (user_id, node_id, mode) VALUES (?, ?, ?)');
  const tx = db.transaction(function () {
    grants.forEach(g => ins.run(user.id, g.id, g.mode));
  });
  tx();
  logChange('add 操作者=' + operator + ' 目标=' + user.emp_no + ' 节点=' +
    grants.map(g => g.mode + ':' + g.name).join(' | '));
}

function showScope(db, user) {
  const scope = effectiveScope(db, user);
  const roleName = loadRole(db, user.role).name || user.role;
  const modeText = { full: '全树（总部级）', auto: '按组织位置自动派生', explicit: '显式授权' }[scope.mode] || scope.mode;
  console.log('');
  console.log('  账号: ' + user.emp_no + '    角色: ' + roleName + '（' + user.role + '）');
  console.log('  范围模式: ' + modeText);
  console.log('  数据范围: ' + scope.scopeName);
  console.log('  覆盖节点: ' + scope.scopeNodeIds.length + ' 个');
  if (scope.grants && scope.grants.length) {
    scope.grants.forEach(g => {
      const tag = g.mode === 'include' ? '管辖' : '排除';
      console.log('    [' + tag + '] ' + g.name + '（' + g.level + '）');
    });
  }
  console.log('');
}

// ------------------------------------------------ 命令模式

function cmdList(db, args) {
  if (args.flags.emp) {
    const user = loadUser(db, args.flags.emp);
    showScope(db, user);
    return;
  }
  const users = db.prepare('SELECT id, emp_no, role, status FROM users ORDER BY role, emp_no').all();
  console.log('\n  全员权限一览（"自动"= 按组织位置派生，其余为显式授权）');
  console.log('  ' + '-'.repeat(86));
  users.forEach(u => {
    const scope = effectiveScope(db, u);
    const roleName = loadRole(db, u.role).name || u.role;
    const mode = scope.mode === 'full' ? '全树' : (scope.mode === 'auto' ? '自动' : '显式');
    const st = u.status === 'active' ? '' : ' [已停用]';
    console.log('  ' + String(u.emp_no).padEnd(10) + String(roleName).padEnd(8) + mode.padEnd(4) +
      '  ' + String(scope.scopeName).slice(0, 44) + st);
  });
  console.log('  ' + '-'.repeat(86) + '\n');
}

function buildGrants(db, user, nodesSpec, excludeSpec, replace) {
  const inc = resolveNodeList(db, nodesSpec);
  if (inc.error) die(inc.error);
  const exc = resolveNodeList(db, excludeSpec);
  if (exc.error) die(exclude.error);
  const grants = [];
  for (const n of inc.nodes) {
    const chk = validateGrantLevel(db, user.role, n.level);
    if (!chk.ok) die(chk.error + '（节点: ' + n.name + '）');
    grants.push({ id: n.id, name: n.name, level: n.level, mode: 'include' });
  }
  for (const n of exc.nodes) {
    const chk = validateGrantLevel(db, user.role, n.level);
    if (!chk.ok) die(chk.error + '（节点: ' + n.name + '）');
    grants.push({ id: n.id, name: n.name, level: n.level, mode: 'exclude' });
  }
  if (!grants.length && !replace) die('未指定任何节点（--nodes / --exclude 至少其一）');
  // 排除节点有效性警告（不阻断）
  if (inc.nodes.length && exc.nodes.length) {
    const incSet = new Set();
    inc.nodes.forEach(g => descendantsOf(db, g.id).forEach(id => incSet.add(id)));
    exc.nodes.filter(g => !incSet.has(g.id)).forEach(g =>
      console.warn('[manage-scope] 提示: 排除节点「' + g.name + '」不在任何管辖子树内，不产生实际效果'));
  }
  return grants;
}

function cmdSet(db, args) {
  if (!args.flags.emp) die('用法：set --emp <工号> --nodes "大区/小区,大区/小区/门店" [--exclude "大区/小区"]');
  const user = loadUser(db, args.flags.emp);
  const grants = buildGrants(db, user, args.flags.nodes, args.flags.exclude, true);
  writeGrants(db, user, grants, 'cli');
  console.log('[manage-scope] OK 已整体替换 ' + user.emp_no + ' 的授权');
  showScope(db, user);
  console.log('  提示: 该用户刷新看板页面即可看到新范围（无需重登）');
}

function cmdAdd(db, args) {
  if (!args.flags.emp) die('用法：add --emp <工号> --nodes "大区/小区" [--exclude "大区/小区"]');
  const user = loadUser(db, args.flags.emp);
  const grants = buildGrants(db, user, args.flags.nodes, args.flags.exclude, false);
  appendGrants(db, user, grants, 'cli');
  console.log('[manage-scope] OK 已追加 ' + grants.length + ' 条授权');
  showScope(db, user);
}

function cmdRemove(db, args) {
  if (!args.flags.emp || !args.flags.nodes) die('用法：remove --emp <工号> --nodes "大区/小区"');
  const user = loadUser(db, args.flags.emp);
  const list = resolveNodeList(db, args.flags.nodes);
  if (list.error) die(list.error);
  const del = db.prepare('DELETE FROM user_scope_nodes WHERE user_id = ? AND node_id = ?');
  let removed = 0;
  const tx = db.transaction(function () {
    list.nodes.forEach(n => { const r = del.run(user.id, n.id); removed += r.changes; });
  });
  tx();
  logChange('remove 操作者=cli 目标=' + user.emp_no + ' 节点=' + list.nodes.map(n => n.name).join(' | ') + ' 实删=' + removed);
  console.log('[manage-scope] OK 已收回 ' + removed + ' 条授权（找不到的节点已跳过）');
  showScope(db, user);
}

function cmdClear(db, args) {
  if (!args.flags.emp) die('用法：clear --emp <工号>');
  const user = loadUser(db, args.flags.emp);
  db.prepare('DELETE FROM user_scope_nodes WHERE user_id = ?').run(user.id);
  logChange('clear 操作者=cli 目标=' + user.emp_no);
  console.log('[manage-scope] OK 已清空 ' + user.emp_no + ' 的授权，回到按组织位置自动派生');
  showScope(db, user);
}

function cmdRole(db, args) {
  const sub = args._[1];
  if (sub === 'list' || !sub) {
    const rows = db.prepare('SELECT code, name, scope_level, permissions, built_in FROM roles ORDER BY built_in DESC, code').all();
    console.log('\n  角色一览');
    rows.forEach(r => {
      let perms = [];
      try { perms = JSON.parse(r.permissions || '[]'); } catch (e) {}
      console.log('  ' + String(r.code).padEnd(16) + String(r.name).padEnd(10) +
        String(r.scope_level || '全树').padEnd(4) + (r.built_in ? '[内置]' : '[自定义]') +
        '  权限: ' + (perms.join(', ') || '无'));
    });
    console.log('');
    return;
  }
  if (sub === 'add') {
    const code = args._[2], name = args._[3];
    if (!code || !name) die('用法：role add <code> <显示名> [--level 大区|小区|门店|人员] [--perms 权限点,权限点]');
    if (!/^[a-zA-Z][a-zA-Z0-9_]{1,31}$/.test(code)) die('code 须为字母开头的 2-32 位字母/数字/下划线');
    if (db.prepare('SELECT 1 FROM roles WHERE code = ?').get(code)) die('角色已存在: ' + code);
    const LEVELS = ['大区', '小区', '门店', '人员'];
    let level = args.flags.level || null;
    if (level !== null && LEVELS.indexOf(level) < 0) die('--level 须为 ' + LEVELS.join('/') + '（不传=全树）');
    let perms = (args.flags.perms || 'dashboard.view').split(/[,，]/).map(s => s.trim()).filter(Boolean);
    const bad = perms.filter(p => KNOWN_PERMS.indexOf(p) < 0);
    if (bad.length) die('未知权限点: ' + bad.join(', ') + '；可用: ' + KNOWN_PERMS.join(', '));
    db.prepare('INSERT INTO roles (code, name, scope_level, permissions, built_in) VALUES (?, ?, ?, ?, 0)')
      .run(code, name, level, JSON.stringify(perms));
    logChange('role-add 操作者=cli 角色=' + code + '(' + name + ') 层级=' + (level || '全树') + ' 权限=' + perms.join(','));
    console.log('[manage-scope] OK 新增角色 ' + code + '（' + name + '）');
    console.log('  提示: 用 npm run users add <工号> ' + code + ' 给账号绑上该角色，再用 set/add 配管辖范围');
    return;
  }
  if (sub === 'del') {
    const code = args._[2];
    if (!code) die('用法：role del <code>');
    const row = db.prepare('SELECT code, built_in FROM roles WHERE code = ?').get(code);
    if (!row) die('角色不存在: ' + code);
    if (row.built_in) die('内置角色不可删除');
    const used = db.prepare('SELECT COUNT(*) AS c FROM users WHERE role = ?').get(code).c;
    if (used > 0) die('仍有 ' + used + ' 个账号使用该角色，请先改绑（npm run users 无改绑命令时，直接 UPDATE users SET role=…）');
    db.prepare('DELETE FROM roles WHERE code = ?').run(code);
    logChange('role-del 操作者=cli 角色=' + code);
    console.log('[manage-scope] OK 已删除角色 ' + code);
    return;
  }
  die('未知子命令: ' + sub + '（可用: list / add / del）');
}

// ------------------------------------------------ 交互菜单模式（傻瓜式）

function menu(db) {
  const readline = require('readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = q => new Promise(resolve => rl.question(q, resolve));

  function grantsOf(userId) {
    return db.prepare(`
      SELECT usn.node_id, usn.mode, n.name, n.level FROM user_scope_nodes usn
      JOIN org_nodes n ON n.id = usn.node_id WHERE usn.user_id = ? ORDER BY usn.mode, n.name`).all(userId);
  }

  async function askEmp(prompt) {
    const emp = (await ask(prompt + '（输 0 返回）: ')).trim();
    if (emp === '0' || emp === '') return null;
    const u = db.prepare('SELECT id, emp_no, role, status FROM users WHERE emp_no = ?').get(emp);
    if (!u) { console.log('  ✗ 找不到工号 ' + emp + '，请重试'); return await askEmp(prompt); }
    return u;
  }

  async function askGrants(user) {
    const nodesStr = (await ask('  请输入管辖节点（多节点用逗号分隔，如 A大区/a小区, A大区/c小区/门店三）: ')).trim();
    if (!nodesStr) { console.log('  ✗ 不能为空（整体替换至少要有一个管辖节点；想清空请用菜单 5）'); return null; }
    const excStr = (await ask('  是否有排除节点？（直接回车=无；如 A大区/b小区）: ')).trim();
    const inc = resolveNodeList(db, nodesStr);
    if (inc.error) { console.log('  ✗ ' + inc.error); return null; }
    const exc = excStr ? resolveNodeList(db, excStr) : { nodes: [] };
    if (exc.error) { console.log('  ✗ ' + exc.error); return null; }
    const grants = [];
    for (const n of inc.nodes) {
      const chk = validateGrantLevel(db, user.role, n.level);
      if (!chk.ok) { console.log('  ✗ ' + chk.error + '（节点: ' + n.name + '）'); return null; }
      grants.push({ id: n.id, name: n.name, level: n.level, mode: 'include' });
    }
    for (const n of exc.nodes) {
      const chk = validateGrantLevel(db, user.role, n.level);
      if (!chk.ok) { console.log('  ✗ ' + chk.error + '（节点: ' + n.name + '）'); return null; }
      grants.push({ id: n.id, name: n.name, level: n.level, mode: 'exclude' });
    }
    if (inc.nodes.length && exc.nodes.length) {
      const incSet = new Set();
      inc.nodes.forEach(g => descendantsOf(db, g.id).forEach(id => incSet.add(id)));
      exc.nodes.filter(g => !incSet.has(g.id)).forEach(g =>
        console.log('  ⚠ 提示: 排除节点「' + g.name + '」不在管辖子树内，不会产生实际效果'));
    }
    return grants;
  }

  async function loop() {
    const users = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
    const roles = db.prepare('SELECT COUNT(*) AS c FROM roles').get().c;
    console.log('\n══════════ 业务数据看板 · 权限管理 v5.2 ══════════');
    console.log('  当前账号库: ' + users + ' 个账号, ' + roles + ' 个角色');
    console.log('  请选择操作:');
    console.log('    1. 查看某人的管辖范围');
    console.log('    2. 给某人分配管辖范围（新建/整体替换）');
    console.log('    3. 追加授权（在他现有范围上增加）');
    console.log('    4. 收回部分授权');
    console.log('    5. 清除全部授权（恢复"按组织结构自动算"）');
    console.log('    6. 查看全部账号权限一览表');
    console.log('    7. 角色管理（查看/新增/删除自定义角色）');
    console.log('    0. 退出');
    const sel = (await ask('  请输入数字: ')).trim();
    try {
      if (sel === '0') { rl.close(); return; }
      if (sel === '1') {
        const u = await askEmp('  工号');
        if (u) showScope(db, u);
      } else if (sel === '2') {
        const u = await askEmp('  工号');
        if (u) {
          showScope(db, u);
          const grants = await askGrants(u);
          if (grants) {
            writeGrants(db, u, grants, 'menu');
            console.log('  ✓ 已生效:');
            showScope(db, u);
            console.log('  该用户下次刷新看板即为新范围（无需重登、无需重启后端）');
          }
        }
      } else if (sel === '3') {
        const u = await askEmp('  工号');
        if (u) {
          const grants = await askGrants(u);
          if (grants) {
            appendGrants(db, u, grants, 'menu');
            console.log('  ✓ 已追加 ' + grants.length + ' 条:');
            showScope(db, u);
          }
        }
      } else if (sel === '4') {
        const u = await askEmp('  工号');
        if (u) {
          showScope(db, u);
          const str = (await ask('  要收回哪些节点？（逗号分隔，如 A大区/a小区）: ')).trim();
          if (str) {
            const list = resolveNodeList(db, str);
            if (list.error) { console.log('  ✗ ' + list.error); }
            else {
              const del = db.prepare('DELETE FROM user_scope_nodes WHERE user_id = ? AND node_id = ?');
              let removed = 0;
              db.transaction(() => list.nodes.forEach(n => { removed += del.run(u.id, n.id).changes; }))();
              logChange('remove(menu) 目标=' + u.emp_no + ' 节点=' + list.nodes.map(n => n.name).join(' | ') + ' 实删=' + removed);
              console.log('  ✓ 已收回 ' + removed + ' 条授权');
              showScope(db, u);
            }
          }
        }
      } else if (sel === '5') {
        const u = await askEmp('  工号');
        if (u) {
          const sure = (await ask('  确认清空 ' + u.emp_no + ' 的全部显式授权？(y/n): ')).trim().toLowerCase();
          if (sure === 'y' || sure === 'yes') {
            db.prepare('DELETE FROM user_scope_nodes WHERE user_id = ?').run(u.id);
            logChange('clear(menu) 目标=' + u.emp_no);
            console.log('  ✓ 已清空，回到按组织位置自动派生');
            showScope(db, u);
          }
        }
      } else if (sel === '6') {
        cmdList(db, { flags: {} });
      } else if (sel === '7') {
        cmdRole(db, { _: ['role', 'list'] });
        const sub = (await ask('  输入 a=新增角色 / d=删除角色 / 回车返回: ')).trim().toLowerCase();
        if (sub === 'a') {
          const code = (await ask('  角色 code（英文，如 supervisor）: ')).trim();
          const name = (await ask('  显示名（如 督导）: ')).trim();
          const level = (await ask('  管辖层级（大区/小区/门店/人员，回车=全树）: ')).trim() || null;
          const permsStr = (await ask('  权限点（逗号分隔，回车=仅看板查看 dashboard.view）: ')).trim();
          const perms = permsStr ? permsStr.split(/[,，]/).map(s => s.trim()).filter(Boolean) : ['dashboard.view'];
          try {
            const bad = perms.filter(p => KNOWN_PERMS.indexOf(p) < 0);
            if (bad.length) throw new Error('未知权限点: ' + bad.join(', ') + '；可用: ' + KNOWN_PERMS.join(', '));
            if (!/^[a-zA-Z][a-zA-Z0-9_]{1,31}$/.test(code)) throw new Error('code 须为字母开头的 2-32 位字母/数字/下划线');
            if (!name) throw new Error('显示名不能为空');
            db.prepare('INSERT INTO roles (code, name, scope_level, permissions, built_in) VALUES (?, ?, ?, ?, 0)')
              .run(code, name, level, JSON.stringify(perms));
            logChange('role-add(menu) 角色=' + code + '(' + name + ') 层级=' + (level || '全树'));
            console.log('  ✓ 新增角色 ' + code + '（' + name + '）');
          } catch (e) { console.log('  ✗ ' + e.message); }
        } else if (sub === 'd') {
          const code = (await ask('  要删除的角色 code: ')).trim();
          try {
            const row = db.prepare('SELECT code, built_in FROM roles WHERE code = ?').get(code);
            if (!row) throw new Error('角色不存在');
            if (row.built_in) throw new Error('内置角色不可删除');
            const used = db.prepare('SELECT COUNT(*) AS c FROM users WHERE role = ?').get(code).c;
            if (used > 0) throw new Error('仍有 ' + used + ' 个账号使用该角色，请先改绑');
            db.prepare('DELETE FROM roles WHERE code = ?').run(code);
            logChange('role-del(menu) 角色=' + code);
            console.log('  ✓ 已删除角色 ' + code);
          } catch (e) { console.log('  ✗ ' + e.message); }
        }
      } else {
        console.log('  请输入 0-7 的数字');
      }
    } catch (e) {
      console.log('  ✗ 出错了: ' + (e.message || e));
    }
    if (sel !== '0') await loop();
    rl.close();
  }

  loop().then(() => { console.log('  再见！'); process.exit(0); }).catch(e => { console.error(e); process.exit(1); });
}

// ------------------------------------------------ 入口

function main() {
  const argv = process.argv.slice(2);
  const db = openDb();
  if (!argv.length) { menu(db); return; }
  const args = parseArgs(argv);
  const cmd = args._[0];
  if (cmd === 'list') cmdList(db, args);
  else if (cmd === 'set') cmdSet(db, args);
  else if (cmd === 'add') cmdAdd(db, args);
  else if (cmd === 'remove') cmdRemove(db, args);
  else if (cmd === 'clear') cmdClear(db, args);
  else if (cmd === 'role') cmdRole(db, args);
  else die('未知命令: ' + cmd + '\n可用: list / set / add / remove / clear / role；不带参数进入交互菜单');
}

main();
