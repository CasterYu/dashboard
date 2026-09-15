'use strict';
/**
 * GET /api/org —— 六级组织树 + 岗位配置（颜色/编制/积分权重）
 * v4：节点带 status / deactivatedAt；**默认只返回在职节点（停用节点整棵子树剪掉）**，
 *     inclInactive=1 时返回全量（前端「显示已停用」开关用），并附带人员工号质量计数
 */
const express = require('express');
const { dataQualityCounts } = require('../services/dataQuality');

function truthy(v) {
  const s = String(v == null ? '' : v).toLowerCase();
  return s === '1' || s === 'true' || s === 'yes';
}

module.exports = function orgRoute(db) {
  const router = express.Router();

  router.get('/org', (req, res) => {
    const inclInactive = truthy(req.query.inclInactive);
    const nodes = db.prepare(
      'SELECT id, name, level, parent_id, post_key, status, deactivated_at FROM org_nodes ORDER BY id'
    ).all();
    const dataQuality = dataQualityCounts(db);

    const posts = db.prepare('SELECT * FROM posts ORDER BY rowid').all().map(p => ({
      key: p.key, name: p.name, color: p.color, min: p.min_cnt, max: p.max_cnt,
      pw: {
        locked: p.pw_locked, delivered: p.pw_delivered, testDrives: p.pw_test_drives,
        invites: p.pw_invites, returnVisits: p.pw_return_visits, opportunities: p.pw_opportunities
      }
    }));

    const dr = db.prepare('SELECT MIN(date) AS min, MAX(date) AS max FROM daily_metrics').get();
    const dateRange = dr.min ? { from: dr.min, to: dr.max } : null;
    if (!nodes.length) return res.json({ ok: true, tree: null, posts, dateRange, dataQuality, hiddenNodes: 0 });

    const rawById = new Map(nodes.map(n => [n.id, n]));
    const childrenOf = new Map();
    nodes.forEach(n => {
      if (n.parent_id == null) return;
      if (!childrenOf.has(n.parent_id)) childrenOf.set(n.parent_id, []);
      childrenOf.get(n.parent_id).push(n);
    });

    // 自上而下判定可见性：自身在职且父节点可见（停用节点整棵子树剪掉）
    const visibleIds = new Set();
    const reached = new Set();
    const queue = nodes.filter(n => n.parent_id == null || !rawById.has(n.parent_id));
    while (queue.length) {
      const n = queue.shift();
      if (reached.has(n.id)) continue;
      reached.add(n.id);
      if (inclInactive || n.status === 1) {
        visibleIds.add(n.id);
        (childrenOf.get(n.id) || []).forEach(c => queue.push(c));
      }
    }
    // 兜底：父链成环等异常导致未遍历到的节点，按自身状态单独判定，避免整支消失
    nodes.forEach(n => { if (!reached.has(n.id) && (inclInactive || n.status === 1)) visibleIds.add(n.id); });

    // 组装嵌套树（父节点不可见时降级为顶层，保证不丢分支）
    const byId = new Map();
    nodes.forEach(n => {
      if (!visibleIds.has(n.id)) return;
      byId.set(n.id, {
        id: n.id, name: n.name, level: n.level, postKey: n.post_key,
        status: n.status, deactivatedAt: n.deactivated_at, children: []
      });
    });
    const tops = [];
    byId.forEach(n => {
      const raw = rawById.get(n.id);
      const p = raw.parent_id == null ? null : byId.get(raw.parent_id);
      if (p) p.children.push(n); else tops.push(n);
    });

    // 根节点：优先 level=全国；无专属根或多个顶层时，用合成根兜住，保证不丢分支
    const natRoot = tops.find(n => n.level === '全国');
    const root = natRoot || (tops.length === 1 ? tops[0] : {
      id: null, name: '全国', level: '全国', postKey: null, children: tops
    });

    res.json({
      ok: true, tree: root, posts, dateRange, inclInactive, dataQuality,
      hiddenNodes: nodes.length - visibleIds.size,          // 被「默认隐藏」剪掉的节点数（含子树）
      inactiveNodesShown: inclInactive ? dataQuality.nodesInactive : 0
    });
  });

  return router;
};
