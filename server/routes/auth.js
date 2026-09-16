'use strict';
/**
 * v4.2 /api/auth 路由：登录 / 当前用户 / 改密 / 登出
 * 登录接口无需鉴权；其他接口均要求 Bearer Token
 */
const express = require('express');
const { login, changePassword, meOf } = require('../services/auth');
const authRequired = require('../middleware/authRequired');

module.exports = function authRoute(db) {
  const router = express.Router();

  // POST /api/auth/login  { emp_no, password } → { ok, token, user, mustChangePassword }
  router.post('/auth/login', async function (req, res) {
    const empNo = req.body && req.body.emp_no;
    const password = req.body && req.body.password;
    if (!empNo || !password) return res.status(400).json({ ok: false, error: '工号与密码不能为空' });
    try {
      const r = await login(db, empNo, password);
      res.json({ ok: true, token: r.token, user: r.user, mustChangePassword: r.mustChangePassword });
    } catch (e) {
      if (e.message === 'AUTH_LOCKED') {
        return res.status(423).json({ ok: false, error: '账号暂时被锁定，请稍后再试或联系管理员' });
      }
      // 账号不存在 / 密码错误 / 必填缺失 统一 401 + 模糊错误，防账号枚举
      return res.status(401).json({ ok: false, error: '工号或密码错误' });
    }
  });

  // GET /api/auth/me → 当前登录者信息（实时刷新 scope）
  router.get('/auth/me', authRequired(db), function (req, res) {
    const u = meOf(db, req.user);
    if (!u) return res.status(401).json({ ok: false, error: '账号不存在' });
    res.json({ ok: true, user: u });
  });

  // POST /api/auth/change-password  { oldPassword, newPassword } → { ok, token }
  router.post('/auth/change-password', authRequired(db), async function (req, res) {
    const oldP = req.body && req.body.oldPassword;
    const newP = req.body && req.body.newPassword;
    try {
      const token = await changePassword(db, req.user.id, oldP, newP);
      res.json({ ok: true, token: token });
    } catch (e) {
      if (e.message === 'AUTH_BAD_NEW_PASSWORD') return res.status(400).json({ ok: false, error: '新密码至少 6 位' });
      if (e.message === 'AUTH_OLD_PASSWORD') return res.status(401).json({ ok: false, error: '原密码错误' });
      return res.status(500).json({ ok: false, error: '改密失败' });
    }
  });

  // POST /api/auth/logout → 客户端清 token；服务端无状态，仅返回成功
  router.post('/auth/logout', function (req, res) {
    res.json({ ok: true });
  });

  return router;
};