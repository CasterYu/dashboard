'use strict';
/**
 * v5.2 中间件：管理接口守卫（挂在 authRequired + scope 之后）
 * 放行条件：hq 角色，或角色 permissions 含指定权限点（默认 'admin.userManage'）
 */
const { hasPerm } = require('../services/auth');

module.exports = function adminRequired(db, perm) {
  const need = perm || 'admin.userManage';
  return function (req, res, next) {
    if (!req.user) return res.status(401).json({ ok: false, error: '未登录' });
    if (!hasPerm(db, req.user.role, need)) {
      return res.status(403).json({ ok: false, error: '仅总部账号或持有「' + need + '」权限的角色可访问' });
    }
    next();
  };
};
