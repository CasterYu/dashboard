'use strict';
/**
 * v5.2 中间件：有效数据范围计算（每请求实时算 req.scopeNodeIds[]）
 * 用法：router.use(scopeMiddleware(db))
 * 必须在 authRequired 之后挂载；通过 req.scopeNodeIds 供业务路由过滤节点 ID
 *
 * 三种模式（services/auth.js effectiveScope）：
 *   full     全树角色（hq / scope_level=NULL 的自定义角色）
 *   auto     无显式授权 → 按人员节点位置单根派生（v5.1 原行为，存量账号零感知）
 *   explicit user_scope_nodes 有记录 → UNION(include 子树) − UNION(exclude 子树)
 */
const { effectiveScope } = require('../services/auth');

module.exports = function scopeMiddleware(db) {
  return function (req, res, next) {
    if (!req.user) return res.status(401).json({ ok: false, error: '未登录' });
    // 实时派生：员工调岗/管理员改授权后下次请求即生效（无需重新登录）
    const scope = effectiveScope(db, req.user);
    req.user.scope_root_id = scope.scopeRootId;
    req.user.scopeMode = scope.mode;
    req.user.scopeName = scope.scopeName;
    req.scopeNodeIds = scope.scopeNodeIds;
    if (scope.mode === 'explicit') {
      req.scopeIncludeIds = scope.includeIds;   // include 根节点 id 列表
      req.scopeExcludeIds = scope.excludeIds;  // exclude 根节点 id 列表
    }
    next();
  };
};
