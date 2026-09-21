'use strict';
/**
 * v1 真实数据导入 CLI：新媒体运营评分（.xlsx）+ 专营店映射表（.xls）
 *
 * 用法（菜单由 数据导入_新媒体.bat 驱动，也可直接命令行）：
 *   node scripts/import-real_v1.js preview        预览：统计 + 生成「未匹配门店清单.xlsx」
 *   node scripts/import-real_v1.js import         导入：仅映射表命中的门店（未匹配的跳过）
 *   node scripts/import-real_v1.js import-all     导入：未命中门店挂「其它/未匹配」一并落库
 *   node scripts/import-real_v1.js status         查看导入批次与当前数据量
 *   node scripts/import-real_v1.js rollback       回滚最近一个未回滚批次（删数据+删本次新建节点）
 *
 * 文件路径可用环境变量覆盖：MAP_FILE / SCORE_FILE
 */
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
const dbh = require('../db');
const { importScoring, parseScoring, clean } = require('../services/actionScoring_v4.6');

const ROOT = path.resolve(__dirname, '..', '..');
const MAP_FILE = process.env.MAP_FILE || 'C:\\Users\\Administrator\\Downloads\\专营店20260918175014.xls';
const SCORE_FILE = process.env.SCORE_FILE || path.join(__dirname, '_sample_xinshibu.xlsx');
const OUT_XLSX = path.join(ROOT, 'data', '未匹配门店清单.xlsx');
const POST_KEY = 'newMedia';
const LOG_TYPE = 'scoring';

// ------------------------------------------------------------ 文件解析

/** 读取 xlsx/xls 为二维数组（与 actionScoring.sheetRows 同口径） */
function rowsOf(file) {
  const wb = XLSX.read(fs.readFileSync(file), { type: 'buffer', cellDates: false });
  return wb.SheetNames.map(function (n) {
    return XLSX.utils.sheet_to_json(wb.Sheets[n], { defval: '', raw: true, header: 1, blankrows: false });
  });
}

/** 映射表 → Map<专营店编码, {region, area, name}>（表头在第 2 行，首行为合并标题） */
function parseMap(file) {
  const rows = rowsOf(file)[0] || [];
  const head = (rows[1] || []).map(clean);
  const iR = head.indexOf('销售大区'), iA = head.indexOf('销售小区');
  const iC = head.indexOf('专营店编码'), iN = head.indexOf('专营店名称');
  if (iR < 0 || iA < 0 || iC < 0) throw new Error('映射表缺少 销售大区/销售小区/专营店编码 列（实际表头：' + head.join(',') + '）');
  const map = new Map();
  for (const r of rows.slice(2)) {
    const code = clean(r[iC]);
    if (!code) continue;
    map.set(code, {
      region: clean(r[iR]) || '其它',
      area: clean(r[iA]) || '未匹配',
      name: clean(r[iN])
    });
  }
  if (!map.size) throw new Error('映射表解析到 0 行数据');
  return map;
}

/** 评分文件（sheet1 明细 + sheet2 汇总，保留店级行） */
function parseScore(file) {
  return parseScoring(fs.readFileSync(file), POST_KEY, { keepStoreRows: true });
}

// ------------------------------------------------------------ 统计与预览

function buildPreview(map, score) {
  const byCode = new Map(); // code → {rows, items:Set, scoreSum, name}
  for (const d of score.details) {
    const c = clean(d.storeCode);
    if (!c) continue;
    if (!byCode.has(c)) byCode.set(c, { code: c, name: clean(d.storeName), rows: 0, items: new Set(), scoreSum: 0 });
    const x = byCode.get(c);
    x.rows++;
    if (d.item) x.items.add(d.item);
    x.scoreSum += d.score;
  }
  // 编码前缀 → 大区分布（来自映射表全量）
  const prefixStat = new Map();
  for (const [code, e] of map) {
    const p = code.slice(0, 1);
    if (!prefixStat.has(p)) prefixStat.set(p, new Map());
    const m = prefixStat.get(p);
    m.set(e.region, (m.get(e.region) || 0) + 1);
  }
  const matched = [], unmatched = [], nameMissing = [];
  for (const x of byCode.values()) {
    const hit = map.get(x.code);
    if (hit) {
      matched.push(x);
      if (!x.name && hit.name) nameMissing.push({ code: x.code, scoreName: '', mapName: hit.name, backfilled: true });
      else if (!x.name) nameMissing.push({ code: x.code, scoreName: '', mapName: '', backfilled: false });
    } else {
      const pref = x.code.slice(0, 1);
      const regions = (prefixStat.get(pref) || new Map());
      const top = Array.from(regions.entries()).sort(function (a, b) { return b[1] - a[1]; });
      unmatched.push({
        code: x.code, name: x.name, rows: x.rows,
        items: Array.from(x.items).join(' / '),
        scoreSum: x.scoreSum, prefix: pref,
        guessRegion: top.length ? top[0][0] + '（同前缀 ' + top[0][1] + '/' + Array.from(regions.values()).reduce(function (a, b) { return a + b; }, 0) + ' 家）' : '无同前缀门店'
      });
    }
  }
  unmatched.sort(function (a, b) { return b.rows - a.rows; });
  return { byCode, matched, unmatched, nameMissing, prefixStat };
}

/** 预览：控制台摘要 + 未匹配门店清单.xlsx（sheet1 未匹配门店 / sheet2 名称补齐对照） */
function preview() {
  const map = parseMap(MAP_FILE);
  const score = parseScore(SCORE_FILE);
  const pv = buildPreview(map, score);
  const regions = new Set(pv.matched.map(function (x) { return map.get(x.code).region; }));
  const areas = new Set(pv.matched.map(function (x) { return map.get(x.code).area; }));

  console.log('================ 预览（不写库） ================');
  console.log('评分文件  : ' + SCORE_FILE);
  console.log('明细行    : ' + score.details.length + '  汇总行: ' + score.sums.length);
  console.log('日期      : ' + Array.from(new Set(score.details.map(function (d) { return d.date; }).filter(Boolean))).join(', '));
  console.log('映射表门店: ' + map.size + ' 家（' + Array.from(new Set(Array.from(map.values()).map(function (e) { return e.region; }))).length + ' 个销售大区）');
  console.log('评分门店  : ' + pv.byCode.size + ' 家 → 命中映射 ' + pv.matched.length + ' 家 / 未命中 ' + pv.unmatched.length + ' 家');
  console.log('命中门店涉及: ' + regions.size + ' 个大区 / ' + areas.size + ' 个小区');
  console.log('店名缺失行: ' + pv.nameMissing.length + ' 家（可用映射表补齐 ' + pv.nameMissing.filter(function (x) { return x.backfilled; }).length + ' 家）');
  console.log('');
  if (pv.unmatched.length) {
    console.log('---- 未命中映射的门店（前 30，完整清单见 Excel）----');
    pv.unmatched.slice(0, 30).forEach(function (u) {
      console.log('  ' + u.code + '  ' + (u.name || '(无店名)') + '  明细' + u.rows + '行 得分' + u.scoreSum + '  前缀' + u.prefix + ' → 猜测 ' + u.guessRegion);
    });
    if (pv.unmatched.length > 30) console.log('  … 其余 ' + (pv.unmatched.length - 30) + ' 家见 Excel');
  }

  // 生成 Excel 清单
  const ws1 = XLSX.utils.aoa_to_sheet([[
    '专营店编码', '评分文件店名', '明细行数', '拿分项', '动作得分合计', '编码前缀', '同前缀主要大区（仅供参考）'
  ]].concat(pv.unmatched.map(function (u) {
    return [u.code, u.name || '(缺失)', u.rows, u.items, u.scoreSum, u.prefix, u.guessRegion];
  })));
  ws1['!cols'] = [{ wch: 12 }, { wch: 28 }, { wch: 9 }, { wch: 34 }, { wch: 12 }, { wch: 9 }, { wch: 30 }];
  const ws2 = XLSX.utils.aoa_to_sheet([[
    '专营店编码', '评分文件店名', '映射表名称', '导入时是否自动补齐'
  ]].concat(pv.nameMissing.map(function (x) {
    return [x.code, '(缺失)', x.mapName || '(映射表亦无)', x.backfilled ? '是（用映射表名称）' : '否（节点名用编码）'];
  })));
  ws2['!cols'] = [{ wch: 12 }, { wch: 14 }, { wch: 34 }, { wch: 22 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws1, '未匹配门店');
  XLSX.utils.book_append_sheet(wb, ws2, '名称补齐对照');
  XLSX.writeFile(wb, OUT_XLSX);
  console.log('');
  console.log('已生成清单: ' + OUT_XLSX + '（sheet1 未匹配门店 / sheet2 名称补齐对照）');
}

// ------------------------------------------------------------ 导入

/** 幂等建节点并记录新建 id（与 service 内 ensureNode 同口径，供回滚） */
function makeEnsurer(db, created) {
  return function ensureNode(name, level, parentId, pk) {
    const exist = db.prepare('SELECT id FROM org_nodes WHERE name = ? AND level = ? AND parent_id IS ?')
      .get(name, level, parentId === null ? null : parentId);
    const id = dbh.findOrCreateNode(db, name, level, parentId, pk || null);
    if (!exist) created.push(id);
    return id;
  };
}

function runImport(db, includeUnmatched) {
  const map = parseMap(MAP_FILE);
  const rootNode = db.prepare("SELECT id FROM org_nodes WHERE level = '全国' ORDER BY id LIMIT 1").get();
  if (!rootNode) throw new Error('数据库中无「全国」根节点');
  const created = [];
  const ensureNode = makeEnsurer(db, created);

  const tx = db.transaction(function () {
    // 第一步：按映射表建全量真实组织树（全国→销售大区→销售小区→门店，幂等）
    for (const e of map.values()) {
      const rid = ensureNode(e.region, '大区', rootNode.id, null);
      const aid = ensureNode(e.area, '小区', rid, null);
      ensureNode(e.name || '门店(未命名)', '门店', aid, null);
    }
    // 第二步+第三步：评分落库（虚拟人员 + 明细 + 汇总）
    const r = importScoring(db, fs.readFileSync(SCORE_FILE), path.basename(SCORE_FILE), {
      postKey: POST_KEY, orgMap: map, virtual: true, includeUnmatched: includeUnmatched, rootId: rootNode.id
    });
    return r;
  });
  const r = tx();

  // 批次记录（回滚凭据）
  const report = {
    postKey: r.postKey, includeUnmatched: !!includeUnmatched,
    detailRows: r.detailRows, sumRows: r.sumRows, persons: r.persons,
    skippedStores: r.skippedStores, unmatchedStores: r.unmatchedStores,
    nameBackfilled: r.nameBackfilled, days: r.days,
    createdNodeIds: created.concat(r.createdNodeIds),
    personIds: r.personIds
  };
  const log = db.prepare('INSERT INTO import_logs (type, filename, rows_ok, rows_failed, report_json) VALUES (?,?,?,?,?)')
    .run(LOG_TYPE, path.basename(SCORE_FILE) + ' + ' + path.basename(MAP_FILE), r.detailRows + r.sumRows, r.skippedStores.reduce(function (a, s) { return a + s.rows * 2; }, 0), JSON.stringify(report));

  console.log('================ 导入完成 ================');
  console.log('批次号    : #' + log.lastInsertRowid + '（回滚时使用）');
  console.log('新建节点  : ' + created.length + ' 个（全量组织树）+ 评分过程新建 ' + r.createdNodeIds.length + ' 个（岗位/虚拟人员等）');
  console.log('明细行    : ' + r.detailRows + ' / 汇总行: ' + r.sumRows);
  console.log('虚拟人员  : ' + r.persons + ' 个（[新媒体运营]店名，无工号不可登录）');
  console.log('店名补齐  : ' + r.nameBackfilled.length + ' 家');
  if (r.skippedStores.length) {
    console.log('跳过门店  : ' + r.skippedStores.length + ' 家（未命中映射，明细行数见下）');
    r.skippedStores.forEach(function (s) { console.log('  ' + s.code + ' 跳过 ' + s.rows + ' 行'); });
    console.log('  → 如需一并导入，运行 import-all（挂「其它/未匹配」），或补齐映射后重跑 import');
  }
}

// ------------------------------------------------------------ 状态 / 回滚

function status(db) {
  const logs = db.prepare("SELECT * FROM import_logs WHERE type = ? ORDER BY id DESC LIMIT 10").all(LOG_TYPE);
  console.log('================ 导入批次（最近 10 条） ================');
  if (!logs.length) { console.log('（无）'); }
  logs.forEach(function (l) {
    let extra = '';
    try {
      const rp = JSON.parse(l.report_json || '{}');
      extra = '  明细' + (rp.detailRows || 0) + ' / 汇总' + (rp.sumRows || 0) + '  人员' + (rp.persons || 0) +
        (rp.rolledBackAt ? '  [已回滚 ' + rp.rolledBackAt + ']' : '') +
        (rp.includeUnmatched ? '  [含未匹配]' : '');
    } catch (e) { /* ignore */ }
    console.log('#' + l.id + '  ' + l.uploaded_at + '  ' + l.filename + '  ok=' + l.rows_ok + ' fail=' + l.rows_failed + extra);
  });
  const cnt = db.prepare("SELECT post_key, COUNT(*) AS rows, COUNT(DISTINCT person_id) AS persons, COUNT(DISTINCT store_id) AS stores, MIN(date) AS d1, MAX(date) AS d2 FROM action_scores WHERE post_key = ? ").get(POST_KEY);
  console.log('');
  console.log('当前 ' + POST_KEY + ' 评分存量: 明细 ' + cnt.rows + ' 行 / ' + cnt.persons + ' 人 / ' + cnt.stores + ' 店 / 日期 ' + cnt.d1 + '~' + cnt.d2);
  const sums = db.prepare("SELECT COUNT(*) AS c FROM action_daily_sums WHERE post_key = ?").get(POST_KEY);
  console.log('当前日汇总存量: ' + sums.c + ' 行');
}

function rollback(db) {
  const log = db.prepare("SELECT * FROM import_logs WHERE type = ? AND report_json NOT LIKE '%\"rolledBackAt\"%' ORDER BY id DESC LIMIT 1").get(LOG_TYPE);
  if (!log) throw new Error('没有可回滚的批次（都回滚过或从未导入）');
  const rp = JSON.parse(log.report_json || '{}');
  const personIds = rp.personIds || [], nodeIds = rp.createdNodeIds || [];
  console.log('即将回滚批次 #' + log.id + '：人员 ' + personIds.length + ' 个 / 节点 ' + nodeIds.length + ' 个');
  const tx = db.transaction(function () {
    if (personIds.length) {
      const q = personIds.map(function () { return '?'; }).join(',');
      db.prepare('DELETE FROM action_scores WHERE person_id IN (' + q + ')').run(personIds);
      db.prepare('DELETE FROM action_daily_sums WHERE person_id IN (' + q + ')').run(personIds);
      db.prepare('DELETE FROM node_paths WHERE person_id IN (' + q + ')').run(personIds);
      db.prepare('DELETE FROM person_assignments WHERE person_id IN (' + q + ')').run(personIds);
    }
    // 自底向上删节点（createdNodeIds 按创建顺序=父先子后，倒序删即子先父后）
    for (let i = nodeIds.length - 1; i >= 0; i--) {
      db.prepare('DELETE FROM org_nodes WHERE id = ?').run(nodeIds[i]);
    }
    rp.rolledBackAt = new Date().toISOString().slice(0, 19).replace('T', ' ');
    db.prepare('UPDATE import_logs SET report_json = ? WHERE id = ?').run(JSON.stringify(rp), log.id);
  });
  tx();
  console.log('回滚完成：批次 #' + log.id + ' 的评分数据、虚拟人员、本次新建组织节点已删除（日志保留并标记已回滚）');
}

// ------------------------------------------------------------ 入口

const mode = process.argv[2] || 'menu';
const db = dbh.openDb();
try {
  if (mode === 'preview') preview();
  else if (mode === 'import') runImport(db, false);
  else if (mode === 'import-all') runImport(db, true);
  else if (mode === 'status') status(db);
  else if (mode === 'rollback') rollback(db);
  else if (mode === 'menu') {
    console.log('v1 真实数据导入（新媒体运营）——请用 bat 菜单或直接传参：preview / import / import-all / status / rollback');
    status(db);
  } else throw new Error('未知模式: ' + mode);
} catch (e) {
  console.error('执行失败: ' + e.message);
  process.exitCode = 1;
} finally {
  db.close();
}
