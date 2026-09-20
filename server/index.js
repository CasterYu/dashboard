'use strict';
/**
 * v4.2 后端入口：路由挂载、CORS 白名单、导入 Token 校验、频率限制、错误处理、JWT 鉴权挂载
 * v4 变更：组织节点生命周期（停用/恢复）、工号唯一识别、任职区间时间切片聚合
 * v4.2 变更：身份权限校验（5 角色 + 工号密码 + JWT 8h + scope 子树过滤）
 */
require('dotenv').config();   // 加载 .env；若未提供则维持 process.env 原值
const express = require('express');
const { openDb, DB_PATH } = require('./db');
const { dataQualityCounts } = require('./services/dataQuality');
const authRoute = require('./routes/auth');
const { AUTH_MODE } = require('./services/auth');   // v5.1：鉴权模式开关（password / emp_only）
const orgRoute = require('./routes/org');
const metricsRoute = require('./routes/metrics');
const importRoute = require('./routes/import');
const adminRoute = require('./routes/admin');
const scoringRoute = require('./routes/scoring_v4.6');

const VERSION = '5.4.0';   // v5.4：下钻人员逐日表接入真实动作评分数据（GET /api/scoring/range）

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
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,X-Import-Token,Authorization');
    res.setHeader('Access-Control-Max-Age', '600');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ---------- 路由 ----------
app.get('/api/health', (req, res) => res.json({ ok: true, version: VERSION, authMode: AUTH_MODE, now: new Date().toISOString() }));
app.use('/api', authRoute(db));
app.use('/api', orgRoute(db));
app.use('/api', metricsRoute(db));
app.use('/api/import', importRoute(db));
app.use('/api', scoringRoute(db));
app.use('/api', adminRoute(db));

// 404 + 统一错误处理
app.use((req, res) => res.status(404).json({ ok: false, error: '接口不存在: ' + req.path }));
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error('[error]', err);
  res.status(500).json({ ok: false, error: '服务器内部错误：' + (err && err.message) });
});

const PORT = process.env.PORT || 3777;
app.listen(PORT, () => {
  console.log(`[dashboard-server] v${VERSION} 已启动: http://127.0.0.1:${PORT}  (数据库: ${DB_PATH})`);
  try {
    const q = dataQualityCounts(db);
    console.log(`[dashboard-server] 在职人员 ${q.personsActive} 人（已停用 ${q.personsInactive}），门店 ${q.storesActive} 家；`
      + (q.activeMissingEmpNo
        ? `其中 ${q.activeMissingEmpNo} 人缺工号——建议导入带「工号」列的全量名册补齐（详见 GET /api/admin/data-quality）`
        : '工号已全覆盖'));
  } catch (e) {
    console.warn('[dashboard-server] 数据质量统计失败：', e.message);
  }
});
