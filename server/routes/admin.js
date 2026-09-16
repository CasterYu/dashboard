'use strict';
/**
 * GET /api/admin/data-quality —— 人员工号质量报告
 * 返回在职缺工号人员清单与重复工号组（仅姓名/门店/岗位/工号，不含敏感信息）
 * 用途：升级到 v4 后先做一次带工号的全量快照导入，用本接口确认还有谁没被认领
 * v4.2：仅 HQ 角色可访问；其他角色 403
 */
const express = require('express');
const { dataQualityCounts, dataQualityReport } = require('../services/dataQuality');
const authRequired = require('../middleware/authRequired');

module.exports = function adminRoute(db) {
  const router = express.Router();
  router.use(authRequired(db));

  router.get('/admin/data-quality', (req, res) => {
    if (req.user.role !== 'hq') return res.status(403).json({ ok: false, error: '仅总部账号可访问数据质量报告' });
    res.json({ ok: true, ...dataQualityCounts(db), ...dataQualityReport(db, req.query.limit) });
  });

  return router;
};
