'use strict';
/**
 * POST /api/import/org     名册导入（?mode=merge|snapshot & dryRun=1 & force=1，需 X-Import-Token）
 * POST /api/import/metrics 指标导入（需 X-Import-Token）
 * POST /api/import/scoring 灯塔动作评分导入（Excel，sheet1 明细 / sheet2 个人日汇总，需 X-Import-Token）
 * POST /api/import/rules   动作积分规则导入（JSON body，需 X-Import-Token）
 * GET  /api/import/template?type=org|metrics   下载模板（七列名册 / 带工号指标）
 * GET  /api/import/logs?limit=                 导入历史（含模式与停用清单摘要）
 */
const express = require('express');
const multer = require('multer');
const { importOrg, importMetrics, ORG_HEADERS, METRICS_HEADERS, ImportConflict } = require('../services/importService');
const { importScoring, importRules } = require('../services/actionScoring_v4.6');

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

function truthy(v) {
  const s = String(v == null ? '' : v).toLowerCase();
  return s === '1' || s === 'true' || s === 'yes';
}

const ORG_TEMPLATE = ORG_HEADERS.join(',')
  + '\n华东大区,上海一区,上海浦东旗舰店,销售专员,张伟,EMP1001,\n'
  + '华东大区,上海一区,上海浦东旗舰店,产品专家,李娜,EMP1002,\n';
const METRICS_TEMPLATE = METRICS_HEADERS.join(',')
  + '\n2026-09-01,上海浦东旗舰店,张伟,销售专员,EMP1001,58,36,20,16,12,10,7,6,5,3,2\n';

/** 报告落库摘要：避免 report_json 过大，只保留计数与已裁剪的清单 */
function logSummary(type, filename, result, extra) {
  const report = Object.assign({}, result, extra || {});
  return {
    sql: 'INSERT INTO import_logs (type, filename, rows_ok, rows_failed, report_json) VALUES (?, ?, ?, ?, ?)',
    params: [
      type, filename, result.rowsOk,
      result.rowsFailedCount != null ? result.rowsFailedCount : (result.rowsFailed || []).length,
      JSON.stringify({
        mode: report.mode || null, dryRun: !!report.dryRun,
        counts: result.counts || null,
        rowsFailed: (result.rowsFailed || []).slice(0, 200),
        deactivated: (result.deactivated || []).slice(0, 200),
        deactivatePlanned: (result.deactivatePlanned || []).slice(0, 200),
        warnings: (result.warnings || []).slice(0, 50),
        storeMismatch: result.storeMismatch || 0
      })
    ]
  };
}

module.exports = function importRoute(db) {
  const router = express.Router();

  router.get('/template', (req, res) => {
    const type = req.query.type === 'org' ? 'org' : 'metrics';
    const csv = '\uFEFF' + (type === 'org' ? ORG_TEMPLATE : METRICS_TEMPLATE);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${type}-template.csv"`);
    res.send(csv);
  });

  // 导入历史（不返回完整报告，只给摘要）
  router.get('/logs', (req, res) => {
    const limit = Math.max(1, Math.min(Number(req.query.limit) || 20, 200));
    const rows = db.prepare(
      'SELECT id, type, filename, uploaded_at, rows_ok, rows_failed, report_json FROM import_logs ORDER BY id DESC LIMIT ?'
    ).all(limit);
    const logs = rows.map(r => {
      let rep = null;
      try { rep = r.report_json ? JSON.parse(r.report_json) : null; } catch (e) { rep = null; }
      return {
        id: r.id, type: r.type, filename: r.filename, uploadedAt: r.uploaded_at,
        rowsOk: r.rows_ok, rowsFailed: r.rows_failed,
        mode: rep && rep.mode, dryRun: !!(rep && rep.dryRun),
        counts: (rep && rep.counts) || null,
        deactivated: rep && rep.deactivated ? rep.deactivated.length : 0,
        storeMismatch: (rep && rep.storeMismatch) || 0,
        failures: (rep && rep.rowsFailed) || []
      };
    });
    res.json({ ok: true, logs });
  });

  router.post('/org', importGuard, upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ ok: false, error: '缺少上传文件（表单字段名 file）' });
    const opts = {
      mode: req.query.mode === 'snapshot' ? 'snapshot' : 'merge',
      dryRun: truthy(req.query.dryRun),
      force: truthy(req.query.force)
    };
    let result;
    try {
      result = importOrg(db, req.file.buffer, req.file.originalname, opts);
    } catch (e) {
      if (e instanceof ImportConflict) {                     // 安全阀拦截：不写库，返回待停用清单
        return res.status(e.statusCode).json({ ok: false, error: e.message, report: e.report });
      }
      return res.status(400).json({ ok: false, error: '文件解析失败：' + e.message });
    }
    // dryRun 只出报告不记账（事务已回滚，写了会误导）
    if (!result.dryRun) {
      const log = logSummary('org', req.file.originalname, result);
      db.prepare(log.sql).run(...log.params);
    }
    res.json({
      ok: true, type: 'org', filename: req.file.originalname,
      mode: result.mode, dryRun: result.dryRun,
      rowsOk: result.rowsOk, rowsFailedCount: result.counts.failed,
      rowsFailed: result.rowsFailed.slice(0, 100),
      report: result
    });
  });

  router.post('/metrics', importGuard, upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ ok: false, error: '缺少上传文件（表单字段名 file）' });
    let result;
    try {
      result = importMetrics(db, req.file.buffer, req.file.originalname);
    } catch (e) {
      return res.status(400).json({ ok: false, error: '文件解析失败：' + e.message });
    }
    const log = logSummary('metrics', req.file.originalname, result);
    db.prepare(log.sql).run(...log.params);
    res.json({
      ok: true, type: 'metrics', filename: req.file.originalname,
      rowsOk: result.rowsOk, rowsFailedCount: result.rowsFailed.length,
      rowsFailed: result.rowsFailed.slice(0, 100),
      storeMismatch: result.storeMismatch
    });
  });

  // ---------- v4.6 灯塔动作评分导入 ----------
  /** multer 按 latin1 解析上传文件名，中文名需转回 utf8（仅影响日志展示） */
  function fixName(name) {
    const raw = String(name || '');
    try {
      const fixed = Buffer.from(raw, 'latin1').toString('utf8');
      return /[\u4e00-\u9fa5]/.test(fixed) ? fixed : raw;
    } catch (e) { return raw; }
  }
  /** 在事务中执行；dryRun 时用哨兵异常回滚，只返回报告不落库 */
  function runTx(fn, dryRun) {
    const tx = db.transaction(fn);
    if (!dryRun) return tx();
    try {
      tx();
    } catch (e) {
      if (e && e.__scoringDryRun) return e.__scoringDryRun;
      throw e;
    }
    return null;
  }

  router.post('/scoring', importGuard, upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ ok: false, error: '缺少上传文件（表单字段名 file）' });
    const dryRun = truthy(req.query.dryRun);
    const filename = fixName(req.file.originalname);
    const opts = { postKey: req.query.postKey || null, post: req.query.post || null };
    let result;
    try {
      result = runTx(() => {
        const r = importScoring(db, req.file.buffer, filename, opts);
        if (dryRun) throw { __scoringDryRun: r };
        return r;
      }, dryRun);
    } catch (e) {
      return res.status(400).json({ ok: false, error: '文件解析失败：' + e.message });
    }
    if (!dryRun) {
      db.prepare('INSERT INTO import_logs (type, filename, rows_ok, rows_failed, report_json) VALUES (?, ?, ?, ?, ?)')
        .run('scoring', filename, result.detailRows, 0, JSON.stringify({
          postKey: result.postKey, detailRows: result.detailRows, sumRows: result.sumRows,
          persons: result.persons,
          storesFromRoster: result.storesFromRoster, storesCreatedCount: result.storesCreatedCount,
          storesCreated: result.storesCreated.slice(0, 50),
          days: result.days
        }));
    }
    res.json({ ok: true, type: 'scoring', filename, dryRun, report: result });
  });

  // ---------- v4.6 动作积分规则导入（前端数据文件的 postRules 结构） ----------
  router.post('/rules', importGuard, express.json({ limit: '4mb' }), (req, res) => {
    const payload = req.body;
    if (!payload || typeof payload !== 'object' || !Object.keys(payload).length) {
      return res.status(400).json({ ok: false, error: '请求体需为规则 JSON（{ postRules: {...} } 或 { postKey, item, ... } 数组）' });
    }
    let result;
    try {
      result = importRules(db, payload);
    } catch (e) {
      return res.status(400).json({ ok: false, error: '规则写入失败：' + e.message });
    }
    db.prepare('INSERT INTO import_logs (type, filename, rows_ok, rows_failed, report_json) VALUES (?, ?, ?, ?, ?)')
      .run('rules', 'inline-json', result.rowsOk, result.rowsSkipped, JSON.stringify({ posts: result.posts }));
    res.json({ ok: true, type: 'rules', ...result });
  });

  return router;
};
