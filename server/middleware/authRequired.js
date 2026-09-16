'use strict';
/**
 * v4.2 中间件：JWT 鉴权（401 拦截 + 挂 req.user）
 * 用法：router.use(authRequired(db))
 */
const { verifyToken, loadUserByEmpNo } = require('../services/auth');

module.exports = function authRequired(db) {
  return function (req, res, next) {
    const h = req.headers.authorization || req.headers.Authorization || '';
    const m = /^Bearer\s+(.+)$/i.exec(h);
    if (!m) return res.status(401).json({ ok: false, error: '未登录或会话已过期' });
    const payload = verifyToken(m[1]);
    if (!payload) return res.status(401).json({ ok: false, error: '未登录或会话已过期' });
    const user = loadUserByEmpNo(db, payload.emp_no);
    if (!user || user.status !== 'active') {
      return res.status(401).json({ ok: false, error: '账号已被禁用或不存在' });
    }
    req.user = {
      id: user.id,
      emp_no: user.emp_no,
      role: user.role,
      scope_root_id: payload.scope_root_id
    };
    next();
  };
};