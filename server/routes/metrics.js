'use strict';
/**
 * GET /api/metrics（节点区间日序列）、/api/persons（节点区间人员汇总）、/api/nodesums（批量节点合计）
 * v4：/api/persons 与 /api/nodesums 支持 inclInactive=1 包含已停用节点（默认排除）；
 *     /api/metrics 为 KPI/趋势口径，不受 status 影响（保证升级后数值与 v3.8 一致）
 * v4.2：先 authRequired + scope；越权节点 id 一律 403，越权 id 自动从批量请求中剔除
 */
const express = require('express');
const { getDailySeries, getPersonsSummary, getNodesSums } = require('../services/metricsService');
const authRequired = require('../middleware/authRequired');
const scopeMiddleware = require('../middleware/scope');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function truthy(v) {
  const s = String(v == null ? '' : v).toLowerCase();
  return s === '1' || s === 'true' || s === 'yes';
}

function parseRange(req, res, db) {
  const rawNode = String(req.query.node == null ? '' : req.query.node).trim();
  const from = String(req.query.from || '');
  const to = String(req.query.to || '');
  if (!DATE_RE.test(from) || !DATE_RE.test(to) || from > to) { res.status(400).json({ ok: false, error: '参数 from/to 须为 YYYY-MM-DD 且 from ≤ to' }); return null; }
  if (rawNode === '' || rawNode === '0' || rawNode === 'all' || rawNode === 'null') return { node: 0, from, to };
  const node = Number(rawNode);
  if (!Number.isInteger(node) || node <= 0) { res.status(400).json({ ok: false, error: '参数 node 必须为节点 id（或 all 表示全部）' }); return null; }
  const nodeRow = db.prepare('SELECT id FROM org_nodes WHERE id = ?').get(node);
  if (!nodeRow) { res.status(404).json({ ok: false, error: '节点不存在: ' + node }); return null; }
  return { node, from, to };
}

/** 判断 nodeId 是否为 rootId 的祖先（含自身）；从 rootId 沿 parent 链向上找 nodeId，用于把「全国/大区」等祖先口径降级为 scope 根 */
function isAncestorOrSelf(db, nodeId, rootId) {
  let cur = rootId, guard = 0;
  while (cur != null && guard++ < 32) {
    if (cur === nodeId) return true;
    const row = db.prepare('SELECT parent_id FROM org_nodes WHERE id = ?').get(cur);
    if (!row) return false;
    cur = row.parent_id;
  }
  return false;
}

/**
 * v4.2 patch3：scope 归一化（替代原来的 assertNodeInScope）
 * hq 允许任意 nodeId（含 0=全网）；其他角色：
 *   nodeId=0 或「scope 根的祖先」（前端树根固定为全国，非 HQ 首屏必然请求到）→ 自动降级为 scope 根节点数据；
 *   scope 内 → 原样；其余 → 403。
 * 返回归一化后的 nodeId；被拒绝时已发送 403 响应并返回 null。
 */
function resolveNodeInScope(req, res, db, nodeId) {
  if (req.user.role === 'hq') return nodeId;
  const rootId = req.user.scope_root_id;
  if (!rootId) { res.status(403).json({ ok: false, error: '账号未绑定组织节点，无数据范围' }); return null; }
  if (nodeId === 0) return rootId;
  const set = req.scopeNodeIds && req.scopeNodeIds.length ? new Set(req.scopeNodeIds) : null;
  if (!set || !set.size) { res.status(403).json({ ok: false, error: '数据范围未初始化' }); return null; }
  if (set.has(nodeId)) return nodeId;
  if (isAncestorOrSelf(db, nodeId, rootId)) return rootId;
  res.status(403).json({ ok: false, error: '节点不在数据范围内: ' + nodeId });
  return null;
}

/** scope 归一化（批量）：hq 全保留；其他角色 scope 内原样、祖先降级为 scope 根（去重）、其余 dropped 报告 */
function filterIdsByScope(req, db, ids) {
  if (req.user.role === 'hq') return { allowed: ids, dropped: [] };
  const rootId = req.user.scope_root_id;
  const set = req.scopeNodeIds && req.scopeNodeIds.length ? new Set(req.scopeNodeIds) : null;
  if (!set || !set.size || !rootId) return { allowed: [], dropped: ids };
  const allowedSet = new Set();
  const dropped = [];
  ids.forEach(function (id) {
    if (set.has(id)) { allowedSet.add(id); return; }
    if (isAncestorOrSelf(db, id, rootId)) { allowedSet.add(rootId); return; }
    dropped.push(id);
  });
  return { allowed: Array.from(allowedSet), dropped: dropped };
}

module.exports = function metricsRoute(db) {
  const router = express.Router();
  router.use(authRequired(db));
  router.use(scopeMiddleware(db));

  router.get('/metrics', (req, res) => {
    const q = parseRange(req, res, db);
    if (!q) return;
    const nid = resolveNodeInScope(req, res, db, q.node);
    if (nid === null) return;
    const t0 = Date.now();
    const result = getDailySeries(db, nid, q.from, q.to);
    res.json({ ok: true, ...result, elapsedMs: Date.now() - t0 });
  });

  router.get('/persons', (req, res) => {
    const q = parseRange(req, res, db);
    if (!q) return;
    const nid = resolveNodeInScope(req, res, db, q.node);
    if (nid === null) return;
    const inclInactive = truthy(req.query.inclInactive);
    const t0 = Date.now();
    const persons = getPersonsSummary(db, nid, q.from, q.to, inclInactive);
    // 二次过滤：人员节点也必须在 scope 内（防止 nodeId 子树外有 dangling 引用）
    const set = req.scopeNodeIds && req.scopeNodeIds.length ? new Set(req.scopeNodeIds) : null;
    const filtered = set === null ? persons : persons.filter(p => set.has(p.personId));
    res.json({ ok: true, persons: filtered, inclInactive, elapsedMs: Date.now() - t0 });
  });

  router.get('/nodesums', (req, res) => {
    const from = String(req.query.from || '');
    const to = String(req.query.to || '');
    if (!DATE_RE.test(from) || !DATE_RE.test(to) || from > to) {
      return res.status(400).json({ ok: false, error: '参数 from/to 须为 YYYY-MM-DD 且 from ≤ to' });
    }
    const ids = String(req.query.nodes || '').split(',').map(s => Number(s.trim()))
      .filter(n => Number.isInteger(n) && n > 0).slice(0, 500);
    if (!ids.length) return res.status(400).json({ ok: false, error: '参数 nodes 须为逗号分隔的节点 id' });
    const { allowed, dropped } = filterIdsByScope(req, db, ids);
    if (!allowed.length) return res.status(403).json({ ok: false, error: '所有节点均不在数据范围内', droppedIds: dropped });
    const inclInactive = truthy(req.query.inclInactive);
    const t0 = Date.now();
    const sums = getNodesSums(db, allowed, from, to, inclInactive);
    res.json({ ok: true, sums, inclInactive, droppedIds: dropped, elapsedMs: Date.now() - t0 });
  });

  return router;
};