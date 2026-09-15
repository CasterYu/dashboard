'use strict';
/** v3.8 后端入口：路由挂载、CORS 白名单、导入 Token 校验、频率限制、错误处理 */
const express = require('express');
const { openDb } = require('./db');
const orgRoute = require('./routes/org');
const metricsRoute = require('./routes/metrics');
const importRoute = require('./routes/import');

const app = express();
const db = openDb();
app.set('db', db);

app.use(express.json({ limit: '2mb' }));

// ---------- CORS 白名单：GitHub Pages 域名 + 本地调试来源 + ALLOW_ORIGINS 追加（逗号分隔，支持 * 通配前缀） ----------
const ALLOWED_ORIGIN_RE = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
const EXTRA_ORIGINS = String(process.env.ALLOW_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
function originAllowed(origin, method) {
  if (!origin) return false;
  if (EXTRA_ORIGINS.includes('*') || EXTRA_ORIGINS.includes(origin)) return true;
  if (EXTRA_ORIGINS.some(p => p.endsWith('*') && origin.startsWith(p.slice(0, -1)))) return true;
  if (origin === 'https://casteryu.github.io' || ALLOWED_ORIGIN_RE.test(origin)) return true;
  // file:// 打开时 origin 为字符串 "null"，仅放行只读 GET
  return origin === 'null' && method === 'GET';
}
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (originAllowed(origin, req.method)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,X-Import-Token');
    res.setHeader('Access-Control-Max-Age', '600');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ---------- 路由 ----------
app.get('/api/health', (req, res) => res.json({ ok: true, version: '3.8.0', now: new Date().toISOString() }));
app.use('/api', orgRoute(db));
app.use('/api', metricsRoute(db));
app.use('/api/import', importRoute(db));

// 404 + 统一错误处理
app.use((req, res) => res.status(404).json({ ok: false, error: '接口不存在: ' + req.path }));
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error('[error]', err);
  res.status(500).json({ ok: false, error: '服务器内部错误：' + (err && err.message) });
});

const PORT = process.env.PORT || 3777;
app.listen(PORT, () => {
  console.log(`[dashboard-server] v3.8 已启动: http://127.0.0.1:${PORT}  (数据库: ${require('./db').DB_PATH})`);
});
