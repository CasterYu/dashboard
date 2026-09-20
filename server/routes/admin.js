'use strict';
/**
 * GET  /api/admin/data-quality                —— 人员工号质量报告（v4.2）
 * GET  /api/admin/users/:empNo/scope-nodes    —— 查看某人显式授权（v5.2）
 * PUT  /api/admin/users/:empNo/scope-nodes    —— 整体替换某人授权 { nodes: [{nodeId|path, mode}] }（v5.2）
 * POST /api/admin/users/:empNo/scope-nodes    —— 追加授权（v5.2）
 * DELETE /api/admin/users/:empNo/scope-nodes  —— 清空授权，回到按组织位置自动派生（v5.2）
 * GET/POST /api/admin/roles、PUT/DELETE /api/admin/roles/:code —— 角色 CRUD（v5.2）
 *
 * v5.2 权限点：admin.dataQuality（数据质量报告）挂在 authRequired 后逐路由判断；
 *             admin.userManage（授权管理）与 roles.manage（角色管理）由 adminRequired 中间件把守。
 */
const express = require('express');
const { dataQualityCounts, dataQualityReport } = require('../services/dataQuality');
const { effectiveScope, loadRole, hasPerm, descendantsOf, resolveNodePath } = require('../services/auth');
const authRequired = require('../middleware/authRequired');
const adminRequired = require('../middleware/adminRequired');

/** 层级深度表：全国=0 大区=1 小区=2 门店=3 岗位=4 人员=5（用于授权倒挂校验） */
const LEVEL_DEPTH = { '全国': 0, '大区': 1, '小区': 2, '门店': 3, '岗位': 4, '人员': 5 };

module.exports = function adminRoute(db) {
  const router = express.Router();
  router.use(authRequired(db));

  router.get('/admin/data-quality', (req, res) => {
    if (!hasPerm(db, req.user.role, 'admin.dataQuality')) {
      return res.status(403).json({ ok: false, error: '仅总部账号或持有相应权限的角色可访问数据质量报告' });
    }
    res.json({ ok: true, ...dataQualityCounts(db), ...dataQualityReport(db, req.query.limit) });
  });

  // ------------------------------------------------ v5.2 授权管理（admin.userManage）
  router.use('/admin/users/:empNo/scope-nodes', adminRequired(db));

  /** 按路径解析节点：共享实现（首段可写可不写"全国"；找不到附同级候选纠错建议） */
  function resolveNode(db, spec) {
    const r = resolveNodePath(db, spec);
    if (r.err) return r;
    return { id: r.id, name: r.name, level: r.level };
  }

  /** 授权倒挂校验：节点层级必须深于等于角色 scope_level（店长只能授门店及以下，防越权） */
  function validateGrantLevel(db, role, nodeLevel) {
    const roleInfo = loadRole(db, role);
    if (roleInfo.scopeLevel === null) return { ok: true };               // 全树角色无限制
    const need = LEVEL_DEPTH[roleInfo.scopeLevel];
    const got = LEVEL_DEPTH[nodeLevel];
    if (need === undefined || got === undefined) return { ok: false, error: '未知层级: ' + nodeLevel };
    if (got < need) {
      return { ok: false, error: '角色「' + (roleInfo.name || role) + '」的管辖层级为「' + roleInfo.scopeLevel +
        '」，不能授予更高层级的节点「' + nodeLevel + '」（防倒挂越权）' };
    }
    return { ok: true };
  }

  /** 解析并校验一批授权节点；返回 { grants } 或 { error } */
  function parseNodes(db, role, nodes) {
    if (!Array.isArray(nodes)) return { error: 'body.nodes 须为数组 [{nodeId|path, mode}]' };
    const seen = new Set();
    const grants = [];
    for (const item of nodes) {
      const spec = (item && (item.nodeId !== undefined ? item.nodeId : item.path)) || (typeof item === 'string' ? item : null);
      const mode = item && item.mode === 'exclude' ? 'exclude' : 'include';
      if (spec === null || spec === undefined || spec === '') return { error: '节点指定为空（nodeId 或 path）' };
      const r = resolveNode(db, spec);
      if (r.err) return { error: r.err + (r.hint ? '；' + r.hint : '') };
      if (seen.has(r.id)) continue;                      // 同节点重复，保留首条
      seen.add(r.id);
      const chk = validateGrantLevel(db, role, r.level);
      if (!chk.ok) return { error: chk.error + '（节点: ' + r.name + '）' };
      grants.push({ nodeId: r.id, mode: mode, name: r.name, level: r.level });
    }
    return { grants: grants };
  }

  /** exclude 节点不在任何 include 子树内时给出警告（不阻断） */
  function excludeWarnings(db, grants) {
    const inc = grants.filter(g => g.mode === 'include');
    const exc = grants.filter(g => g.mode === 'exclude');
    if (!inc.length || !exc.length) return [];
    const incSet = new Set();
    inc.forEach(g => descendantsOf(db, g.nodeId).forEach(id => incSet.add(id)));
    return exc.filter(g => !incSet.has(g.nodeId)).map(g =>
      '排除节点「' + g.name + '」不在任何授权子树内，不产生实际效果');
  }

  router.get('/admin/users/:empNo/scope-nodes', (req, res) => {
    const user = db.prepare('SELECT id, emp_no, role, status FROM users WHERE emp_no = ?').get(req.params.empNo);
    if (!user) return res.status(404).json({ ok: false, error: '账号不存在: ' + req.params.empNo });
    const grants = db.prepare(`
      SELECT usn.node_id AS nodeId, usn.mode, n.name, n.level
      FROM user_scope_nodes usn JOIN org_nodes n ON n.id = usn.node_id
      WHERE usn.user_id = ? ORDER BY usn.mode, n.name`).all(user.id);
    const scope = effectiveScope(db, user);
    res.json({
      ok: true, empNo: user.emp_no, role: user.role,
      mode: scope.mode, scopeName: scope.scopeName,
      scopeNodeCount: scope.scopeNodeIds.length,
      grants: grants,
      roleName: loadRole(db, user.role).name
    });
  });

  router.put('/admin/users/:empNo/scope-nodes', (req, res) => {
    const user = db.prepare('SELECT id, emp_no, role, status FROM users WHERE emp_no = ?').get(req.params.empNo);
    if (!user) return res.status(404).json({ ok: false, error: '账号不存在: ' + req.params.empNo });
    const parsed = parseNodes(db, user.role, req.body && req.body.nodes);
    if (parsed.error) return res.status(400).json({ ok: false, error: parsed.error });
    const warnings = excludeWarnings(db, parsed.grants);
    const del = db.prepare('DELETE FROM user_scope_nodes WHERE user_id = ?');
    const ins = db.prepare('INSERT OR IGNORE INTO user_scope_nodes (user_id, node_id, mode) VALUES (?, ?, ?)');
    const tx = db.transaction(function (grants) {
      del.run(user.id);
      grants.forEach(g => ins.run(user.id, g.nodeId, g.mode));
    });
    tx(parsed.grants);
    const scope = effectiveScope(db, user);
    console.log('[scope] %s 授权已整体替换：操作者=%s，目标=%s，节点数=%d',
      new Date().toLocaleString(), req.user.emp_no, user.emp_no, parsed.grants.length);
    res.json({ ok: true, empNo: user.emp_no, grants: parsed.grants, warnings: warnings,
      mode: scope.mode, scopeName: scope.scopeName, scopeNodeCount: scope.scopeNodeIds.length });
  });

  router.post('/admin/users/:empNo/scope-nodes', (req, res) => {
    const user = db.prepare('SELECT id, emp_no, role, status FROM users WHERE emp_no = ?').get(req.params.empNo);
    if (!user) return res.status(404).json({ ok: false, error: '账号不存在: ' + req.params.empNo });
    const parsed = parseNodes(db, user.role, req.body && req.body.nodes);
    if (parsed.error) return res.status(400).json({ ok: false, error: parsed.error });
    const warnings = excludeWarnings(db, parsed.grants);
    const ins = db.prepare('INSERT OR IGNORE INTO user_scope_nodes (user_id, node_id, mode) VALUES (?, ?, ?)');
    const tx = db.transaction(function (grants) {
      grants.forEach(g => ins.run(user.id, g.nodeId, g.mode));
    });
    tx(parsed.grants);
    const scope = effectiveScope(db, user);
    console.log('[scope] %s 授权已追加：操作者=%s，目标=%s，节点数=%d',
      new Date().toLocaleString(), req.user.emp_no, user.emp_no, parsed.grants.length);
    res.json({ ok: true, empNo: user.emp_no, added: parsed.grants, warnings: warnings,
      mode: scope.mode, scopeName: scope.scopeName, scopeNodeCount: scope.scopeNodeIds.length });
  });

  router.delete('/admin/users/:empNo/scope-nodes', (req, res) => {
    const user = db.prepare('SELECT id, emp_no, role, status FROM users WHERE emp_no = ?').get(req.params.empNo);
    if (!user) return res.status(404).json({ ok: false, error: '账号不存在: ' + req.params.empNo });
    db.prepare('DELETE FROM user_scope_nodes WHERE user_id = ?').run(user.id);
    const scope = effectiveScope(db, user);
    console.log('[scope] %s 授权已清空（回到自动派生）：操作者=%s，目标=%s',
      new Date().toLocaleString(), req.user.emp_no, user.emp_no);
    res.json({ ok: true, empNo: user.emp_no, mode: scope.mode, scopeName: scope.scopeName });
  });

  // ------------------------------------------------ v5.2 角色管理（roles.manage）
  router.use('/admin/roles', adminRequired(db, 'roles.manage'));

  router.get('/admin/roles', (req, res) => {
    const rows = db.prepare('SELECT code, name, scope_level, permissions, built_in, created_at FROM roles ORDER BY built_in DESC, code').all();
    res.json({ ok: true, roles: rows.map(r => ({
      code: r.code, name: r.name, scopeLevel: r.scope_level,
      permissions: JSON.parse(r.permissions || '[]'), builtIn: !!r.built_in, createdAt: r.created_at
    })) });
  });

  router.post('/admin/roles', (req, res) => {
    const b = req.body || {};
    const code = String(b.code || '').trim();
    const name = String(b.name || '').trim();
    if (!/^[a-zA-Z][a-zA-Z0-9_]{1,31}$/.test(code)) {
      return res.status(400).json({ ok: false, error: '角色 code 须为 2-32 位字母开头的字母/数字/下划线' });
    }
    if (!name) return res.status(400).json({ ok: false, error: '角色显示名不能为空' });
    const LEVELS = ['大区', '小区', '门店', '人员'];
    let scopeLevel = b.scopeLevel === null || b.scopeLevel === undefined ? null : String(b.scopeLevel);
    if (scopeLevel !== null && LEVELS.indexOf(scopeLevel) < 0) {
      return res.status(400).json({ ok: false, error: 'scopeLevel 须为 ' + LEVELS.join('/') + ' 或 null（全树）' });
    }
    if (code === 'hq') return res.status(400).json({ ok: false, error: 'hq 为保留角色 code' });
    let perms = b.permissions;
    if (perms === undefined || perms === null) perms = ['dashboard.view'];
    if (!Array.isArray(perms)) return res.status(400).json({ ok: false, error: 'permissions 须为字符串数组' });
    const known = ['dashboard.view', 'admin.dataQuality', 'metrics.fullTree', 'admin.userManage', 'roles.manage'];
    const bad = perms.filter(p => known.indexOf(p) < 0);
    if (bad.length) return res.status(400).json({ ok: false, error: '未知权限点: ' + bad.join(', ') + '（可用: ' + known.join(', ') + '）' });
    try {
      db.prepare('INSERT INTO roles (code, name, scope_level, permissions, built_in) VALUES (?, ?, ?, ?, 0)')
        .run(code, name, scopeLevel, JSON.stringify(perms));
    } catch (e) {
      return res.status(409).json({ ok: false, error: '角色已存在: ' + code });
    }
    console.log('[roles] %s 新增角色 %s（%s）：操作者=%s', new Date().toLocaleString(), code, name, req.user.emp_no);
    res.json({ ok: true, role: { code, name, scopeLevel, permissions: perms, builtIn: false } });
  });

  router.put('/admin/roles/:code', (req, res) => {
    const row = db.prepare('SELECT * FROM roles WHERE code = ?').get(req.params.code);
    if (!row) return res.status(404).json({ ok: false, error: '角色不存在: ' + req.params.code });
    const b = req.body || {};
    const name = b.name === undefined ? row.name : String(b.name).trim();
    if (!name) return res.status(400).json({ ok: false, error: '角色显示名不能为空' });
    const LEVELS = ['大区', '小区', '门店', '人员'];
    let scopeLevel = b.scopeLevel === undefined ? row.scope_level : (b.scopeLevel === null ? null : String(b.scopeLevel));
    if (scopeLevel !== null && LEVELS.indexOf(scopeLevel) < 0) {
      return res.status(400).json({ ok: false, error: 'scopeLevel 须为 ' + LEVELS.join('/') + ' 或 null（全树）' });
    }
    if (row.built_in && b.scopeLevel !== undefined && scopeLevel !== row.scope_level) {
      return res.status(400).json({ ok: false, error: '内置角色的管辖层级不可修改（可改显示名与权限点）' });
    }
    let perms = b.permissions === undefined ? JSON.parse(row.permissions || '[]') : b.permissions;
    if (!Array.isArray(perms)) return res.status(400).json({ ok: false, error: 'permissions 须为字符串数组' });
    const known = ['dashboard.view', 'admin.dataQuality', 'metrics.fullTree', 'admin.userManage', 'roles.manage'];
    const bad = perms.filter(p => known.indexOf(p) < 0);
    if (bad.length) return res.status(400).json({ ok: false, error: '未知权限点: ' + bad.join(', ') });
    db.prepare('UPDATE roles SET name = ?, scope_level = ?, permissions = ? WHERE code = ?')
      .run(name, scopeLevel, JSON.stringify(perms), row.code);
    console.log('[roles] %s 更新角色 %s：操作者=%s', new Date().toLocaleString(), row.code, req.user.emp_no);
    res.json({ ok: true, role: { code: row.code, name, scopeLevel, permissions: perms, builtIn: !!row.built_in } });
  });

  router.delete('/admin/roles/:code', (req, res) => {
    const row = db.prepare('SELECT code, built_in FROM roles WHERE code = ?').get(req.params.code);
    if (!row) return res.status(404).json({ ok: false, error: '角色不存在: ' + req.params.code });
    if (row.built_in) return res.status(400).json({ ok: false, error: '内置角色不可删除（可将其从账号上移除）' });
    const used = db.prepare('SELECT COUNT(*) AS c FROM users WHERE role = ?').get(row.code).c;
    if (used > 0) return res.status(409).json({ ok: false, error: '仍有 ' + used + ' 个账号使用该角色，请先改绑' });
    db.prepare('DELETE FROM roles WHERE code = ?').run(row.code);
    console.log('[roles] %s 删除角色 %s：操作者=%s', new Date().toLocaleString(), row.code, req.user.emp_no);
    res.json({ ok: true, deleted: row.code });
  });

  return router;
};
