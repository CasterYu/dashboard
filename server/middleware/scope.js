'use strict';
/**
 * v4.2 中间件：scope 计算（按当前人员节点子树 CTE 实时算 req.scopeNodeIds[]）
 * 用法：router.use(scopeMiddleware(db))
 * 必须在 authRequired 之后挂载；通过 req.scopeNodeIds 供业务路由过滤节点 ID
 */
const { findPersonByEmpNo, descendantsOf, scopeRootForRole } = require('../services/auth');

module.exports = function scopeMiddleware(db) {
  return function (req, res, next) {
    if (!req.user) return res.status(401).json({ ok: false, error: '未登录' });
    const person = findPersonByEmpNo(db, req.user.emp_no);
    // 实时派生：员工调岗后下次请求即按新节点子树生效（无需重新登录）
    const scopeRootId = scopeRootForRole(db, person, req.user.role);
    req.user.scope_root_id = scopeRootId;
    req.scopeNodeIds = descendantsOf(db, scopeRootId);
    next();
  };
};