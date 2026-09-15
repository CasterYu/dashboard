'use strict';
/**
 * GET /api/admin/data-quality —— 人员工号质量报告
 * 返回在职缺工号人员清单与重复工号组（仅姓名/门店/岗位/工号，不含敏感信息）
 * 用途：升级到 v4 后先做一次带工号的全量快照导入，用本接口确认还有谁没被认领
 */
const express = require('express');
const { dataQualityCounts, dataQualityReport } = require('../services/dataQuality');

module.exports = function adminRoute(db) {
  const router = express.Router();

  router.get('/admin/data-quality', (req, res) => {
    res.json({ ok: true, ...dataQualityCounts(db), ...dataQualityReport(db, req.query.limit) });
  });

  return router;
};
