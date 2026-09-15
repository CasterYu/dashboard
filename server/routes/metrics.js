'use strict';
/** GET /api/metrics（节点区间日序列）与 GET /api/persons（节点区间人员汇总） */
const express = require('express');
const { getDailySeries, getPersonsSummary, getNodesSums } = require('../services/metricsService');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseRange(req, res, db) {
  const rawNode = String(req.query.node == null ? '' : req.query.node).trim();
  const from = String(req.query.from || '');
  const to = String(req.query.to || '');
  if (!DATE_RE.test(from) || !DATE_RE.test(to) || from > to) { res.status(400).json({ ok: false, error: '参数 from/to 须为 YYYY-MM-DD 且 from ≤ to' }); return null; }
  // node 省略 / all / 0 视为「全网全部人员」，用于组织树根节点无 id 的兜底
  if (rawNode === '' || rawNode === '0' || rawNode === 'all' || rawNode === 'null') return { node: 0, from, to };
  const node = Number(rawNode);
  if (!Number.isInteger(node) || node <= 0) { res.status(400).json({ ok: false, error: '参数 node 必须为节点 id（或 all 表示全部）' }); return null; }
  const nodeRow = db.prepare('SELECT id FROM org_nodes WHERE id = ?').get(node);
  if (!nodeRow) { res.status(404).json({ ok: false, error: '节点不存在: ' + node }); return null; }
  return { node, from, to };
}

module.exports = function metricsRoute(db) {
  const router = express.Router();

  router.get('/metrics', (req, res) => {
    const q = parseRange(req, res, db);
    if (!q) return;
    const t0 = Date.now();
    const result = getDailySeries(db, q.node, q.from, q.to);
    res.json({ ok: true, ...result, elapsedMs: Date.now() - t0 });
  });

  router.get('/persons', (req, res) => {
    const q = parseRange(req, res, db);
    if (!q) return;
    const t0 = Date.now();
    const persons = getPersonsSummary(db, q.node, q.from, q.to);
    res.json({ ok: true, persons, elapsedMs: Date.now() - t0 });
  });

  // 批量节点区间合计：?nodes=1,2,3&from=&to= → { sums: { "<nodeId>": {...} } }
  router.get('/nodesums', (req, res) => {
    const from = String(req.query.from || '');
    const to = String(req.query.to || '');
    if (!DATE_RE.test(from) || !DATE_RE.test(to) || from > to) {
      return res.status(400).json({ ok: false, error: '参数 from/to 须为 YYYY-MM-DD 且 from ≤ to' });
    }
    const ids = String(req.query.nodes || '').split(',').map(s => Number(s.trim()))
      .filter(n => Number.isInteger(n) && n > 0).slice(0, 500);
    if (!ids.length) return res.status(400).json({ ok: false, error: '参数 nodes 须为逗号分隔的节点 id' });
    const t0 = Date.now();
    const sums = getNodesSums(db, ids, from, to);
    res.json({ ok: true, sums, elapsedMs: Date.now() - t0 });
  });

  return router;
};
