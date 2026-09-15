'use strict';
/** POST /api/import/org、POST /api/import/metrics（需 X-Import-Token）、GET /api/import/template */
const express = require('express');
const multer = require('multer');
const { importOrg, importMetrics, ORG_HEADERS, METRICS_HEADERS } = require('../services/importService');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// 固定 Token + 频率限制（10 次/分钟/IP），仅作用于 POST
const IMPORT_TOKEN = process.env.IMPORT_TOKEN || 'change-me-import-token';
const importHits = new Map();
function importGuard(req, res, next) {
  const ip = req.ip || 'unknown';
  const now = Date.now();
  const list = (importHits.get(ip) || []).filter(t => now - t < 60000);
  if (list.length >= 10) return res.status(429).json({ ok: false, error: '导入请求过于频繁，请 1 分钟后再试' });
  list.push(now);
  importHits.set(ip, list);
  if ((req.headers['x-import-token'] || '') !== IMPORT_TOKEN) {
    return res.status(401).json({ ok: false, error: '导入 Token 无效（请求头 X-Import-Token）' });
  }
  next();
}

const ORG_TEMPLATE = ORG_HEADERS.join(',') + '\n华东大区,上海一区,上海浦东旗舰店,销售专员,张伟\n';
const METRICS_TEMPLATE = METRICS_HEADERS.join(',') + '\n2026-09-01,上海浦东旗舰店,张伟,销售专员,58,36,20,16,12,10,7,6,5,3,2\n';

module.exports = function importRoute(db) {
  const router = express.Router();

  router.get('/template', (req, res) => {
    const type = req.query.type === 'org' ? 'org' : 'metrics';
    const csv = '\uFEFF' + (type === 'org' ? ORG_TEMPLATE : METRICS_TEMPLATE);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${type}-template.csv"`);
    res.send(csv);
  });

  router.post('/org', importGuard, upload.single('file'), (req, res) => {
    handle('org', req, res, buf => importOrg(db, buf, req.file.originalname));
  });

  router.post('/metrics', importGuard, upload.single('file'), (req, res) => {
    handle('metrics', req, res, buf => importMetrics(db, buf, req.file.originalname));
  });

  function handle(type, req, res, run) {
    if (!req.file) return res.status(400).json({ ok: false, error: '缺少上传文件（表单字段名 file）' });
    let result;
    try { result = run(req.file.buffer); }
    catch (e) { return res.status(400).json({ ok: false, error: '文件解析失败：' + e.message }); }
    db.prepare('INSERT INTO import_logs (type, filename, rows_ok, rows_failed, report_json) VALUES (?, ?, ?, ?, ?)')
      .run(type, req.file.originalname, result.rowsOk, result.rowsFailed.length,
           JSON.stringify(result.rowsFailed.slice(0, 500)));
    res.json({
      ok: true, type, filename: req.file.originalname,
      rowsOk: result.rowsOk, rowsFailedCount: result.rowsFailed.length,
      rowsFailed: result.rowsFailed.slice(0, 100)
    });
  }

  return router;
};
