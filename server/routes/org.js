'use strict';
/** GET /api/org —— 六级组织树 + 岗位配置（颜色/编制/积分权重） */
const express = require('express');

module.exports = function orgRoute(db) {
  const router = express.Router();

  router.get('/org', (req, res) => {
    const nodes = db.prepare('SELECT id, name, level, parent_id, post_key FROM org_nodes ORDER BY id').all();
    if (!nodes.length) return res.json({ ok: true, tree: null, posts: [], dateRange: null });

    // 组装嵌套树
    const byId = new Map();
    const rawById = new Map(nodes.map(n => [n.id, n]));
    nodes.forEach(n => byId.set(n.id, { id: n.id, name: n.name, level: n.level, postKey: n.post_key, children: [] }));
    const tops = [];
    byId.forEach(n => {
      const raw = rawById.get(n.id);
      if (raw.parent_id === null) { tops.push(n); return; }
      const p = byId.get(raw.parent_id);
      if (p) p.children.push(n); else tops.push(n); // 父节点缺失时降级为顶层，避免丢节点
    });

    // 根节点：优先 level=全国；无专属根或多个顶层时，用合成根兜住，保证不丢分支
    const natRoot = tops.find(n => n.level === '全国');
    const root = natRoot || (tops.length === 1 ? tops[0] : {
      id: null, name: '全国', level: '全国', postKey: null, children: tops
    });

    const posts = db.prepare('SELECT * FROM posts ORDER BY rowid').all().map(p => ({
      key: p.key, name: p.name, color: p.color, min: p.min_cnt, max: p.max_cnt,
      pw: {
        locked: p.pw_locked, delivered: p.pw_delivered, testDrives: p.pw_test_drives,
        invites: p.pw_invites, returnVisits: p.pw_return_visits, opportunities: p.pw_opportunities
      }
    }));

    const dr = db.prepare('SELECT MIN(date) AS min, MAX(date) AS max FROM daily_metrics').get();
    res.json({ ok: true, tree: root, posts, dateRange: dr.min ? { from: dr.min, to: dr.max } : null });
  });

  return router;
};
