'use strict';
/**
 * v5.4 多岗位真实评分批量导入 CLI（产品专家 / 交付店长 / 交付专员 / 数营专家）
 *
 * 用法（菜单由 数据导入_新媒体.bat 驱动，也可直接命令行）：
 *   node scripts/import-multi_v5.4.js preview              预览 4 岗位：统计 + 生成「未匹配门店清单_多岗位_v5.4.xlsx」
 *   node scripts/import-multi_v5.4.js import               导入：仅映射表命中的门店（每岗位独立批次，未命中跳过）
 *   node scripts/import-multi_v5.4.js import-all           导入：未命中门店挂「其它/未匹配」一并落库（慎用）
 *   node scripts/import-multi_v5.4.js status               查看导入批次与 5 岗位当前数据量
 *   node scripts/import-multi_v5.4.js rollback             回滚最近一个未回滚批次（删数据+删该批新建节点）
 *   node scripts/import-multi_v5.4.js rollback <batchId>   回滚指定批次
 *
 * 文件路径可用环境变量覆盖：MAP_FILE / FILES_JSON（JSON 数组 [{key,name,file}]）
 * 复用 services/actionScoring_v4.6.js 的 parseScoring / importScoring，零侵入。
 */
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
const dbh = require('../db');
const { importScoring, parseScoring, clean } = require('../services/actionScoring_v4.6');

const ROOT = path.resolve(__dirname, '..', '..');
const MAP_FILE = process.env.MAP_FILE || 'C:\\Users\\Administrator\\Downloads\\专营店20260918175014.xls';
const OUT_XLSX = path.join(ROOT, '未匹配门店清单_多岗位_v5.4.xlsx');
const LOG_TYPE = 'scoring';
const DROP = 'C:\\Users\\ADMINI~1\\AppData\\Local\\Temp\\codebuddy-dropped-files';

const JOBS = process.env.FILES_JSON ? JSON.parse(process.env.FILES_JSON) : [
  { key: 'productExpert',      name: '产品专家', file: DROP + '\\65f42e0a-a48e-46a5-ae71-80e3b49af5c5\\产品专家评分结果.xlsx' },
  { key: 'deliveryManager',    name: '交付店长', file: DROP + '\\3a0df07a-50cd-4f8d-96c3-d94172441553\\交付店长评分结果.xlsx' },
  { key: 'deliverySpecialist', name: '交付专员', file: DROP + '\\3ca37e1c-4fef-44d6-8686-11aab0a7a860\\交付专员评分结果.xlsx' },
  { key: 'dataExpert',         name: '数营专家', file: DROP + '\\524368c0-268c-42f4-a571-33054822e0c1\\数营专家评分结果.xlsx' }
];
const ALL_POST_KEYS = JOBS.map(function (j) { return j.key; }).concat(['newMedia']);

// ------------------------------------------------------------ 文件解析（与 import-real_v1.js 同口径）

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

/**
 * 交付店长/交付专员的「专营店编码」是 DMS 内部数字编码（389/1005/52295…），
 * 与映射表字母编码（A0537…）体系不同，但店名基本齐全。
 * 这里按店名把数字编码别名到映射表条目（店名→条目，映射表店名已验证无重复），
 * 返回扩充后的 orgMap（原 map 不动，树构建仍走原 map）。
 */
function augmentMapByName(map, file) {
  const byName = new Map();
  for (const entry of map.values()) if (entry.name) byName.set(entry.name, entry);
  const alias = new Map();          // 数字编码 → 映射条目
  const unmatchedNames = new Set(); // 有店名但映射表查不到
  const sheets = rowsOf(file);
  for (const rows of sheets.slice(0, 2)) {
    for (const r of (rows || []).slice(2)) {
      const code = clean(r[1]);
      if (!code || map.has(code) || alias.has(code)) continue;
      const name = clean(r[0]);
      if (!name) continue;
      const hit = byName.get(name);
      if (hit) alias.set(code, hit);
      else unmatchedNames.add(name + '(' + code + ')');
    }
  }
  const effective = new Map(map);
  for (const e of alias) effective.set(e[0], e[1]);
  return { effective: effective, aliasCount: alias.size, unmatchedNames: Array.from(unmatchedNames) };
}

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
  for (const entry of map) {
    const code = entry[0], e = entry[1];
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
      if (!x.name && hit.name) nameMissing.push({ code: x.code, mapName: hit.name, backfilled: true });
      else if (!x.name) nameMissing.push({ code: x.code, mapName: '', backfilled: false });
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
  return { byCode, matched, unmatched, nameMissing };
}

// ------------------------------------------------------------ 预览

function preview() {
  const map = parseMap(MAP_FILE);
  console.log('================ 多岗位预览（不写库） ================');
  console.log('映射表    : ' + MAP_FILE);
  console.log('映射门店  : ' + map.size + ' 家');
  console.log('');
  const wb = XLSX.utils.book_new();
  const summaryRows = [['岗位', '明细行', '汇总行', '日期', '评分门店数', '命中映射', '未命中', '店名缺失(可补齐)']];
  JOBS.forEach(function (job) {
    const score = parseScoring(fs.readFileSync(job.file), job.key, { keepStoreRows: true });
    const aug = augmentMapByName(map, job.file);
    const effMap = aug.effective;
    const pv = buildPreview(effMap, score);
    const regions = new Set(pv.matched.map(function (x) { return effMap.get(x.code).region; }));
    const areas = new Set(pv.matched.map(function (x) { return effMap.get(x.code).area; }));
    const dates = Array.from(new Set(score.details.map(function (d) { return d.date; }).filter(Boolean))).join(', ');
    console.log('---- ' + job.name + '（' + job.key + '）----');
    console.log('  文件    : ' + job.file);
    console.log('  明细行  : ' + score.details.length + '  汇总行: ' + score.sums.length + '  日期: ' + dates);
    if (aug.aliasCount) {
      console.log('  店名别名: ' + aug.aliasCount + ' 个数字编码已按店名对齐映射表');
      if (aug.unmatchedNames.length) console.log('  店名未对上: ' + aug.unmatchedNames.length + ' 家（' + aug.unmatchedNames.join('、') + '）');
    }
    console.log('  评分门店: ' + pv.byCode.size + ' 家 → 命中 ' + pv.matched.length + ' / 未命中 ' + pv.unmatched.length);
    console.log('  命中涉及: ' + regions.size + ' 个大区 / ' + areas.size + ' 个小区');
    console.log('  店名缺失: ' + pv.nameMissing.length + ' 家（映射表可补齐 ' + pv.nameMissing.filter(function (x) { return x.backfilled; }).length + ' 家）');
    if (pv.unmatched.length) {
      pv.unmatched.slice(0, 10).forEach(function (u) {
        console.log('    未命中  ' + u.code + '  ' + (u.name || '(无店名)') + '  明细' + u.rows + '行  前缀' + u.prefix + ' → ' + u.guessRegion);
      });
      if (pv.unmatched.length > 10) console.log('    … 其余 ' + (pv.unmatched.length - 10) + ' 家见 Excel 清单');
    }
    summaryRows.push([job.name, score.details.length, score.sums.length, dates, pv.byCode.size, pv.matched.length, pv.unmatched.length,
      pv.nameMissing.length + '(' + pv.nameMissing.filter(function (x) { return x.backfilled; }).length + ')']);
    const ws = XLSX.utils.aoa_to_sheet([[
      '专营店编码', '评分文件店名', '明细行数', '拿分项', '动作得分合计', '编码前缀', '同前缀主要大区（仅供参考）'
    ]].concat(pv.unmatched.map(function (u) {
      return [u.code, u.name || '(缺失)', u.rows, u.items, u.scoreSum, u.prefix, u.guessRegion];
    })));
    ws['!cols'] = [{ wch: 12 }, { wch: 28 }, { wch: 9 }, { wch: 34 }, { wch: 12 }, { wch: 9 }, { wch: 30 }];
    XLSX.utils.book_append_sheet(wb, ws, job.name + '未匹配');
    if (pv.nameMissing.length) {
      const wsn = XLSX.utils.aoa_to_sheet([[
        '专营店编码', '评分文件店名', '映射表名称', '导入时是否自动补齐'
      ]].concat(pv.nameMissing.map(function (x) {
        return [x.code, '(缺失)', x.mapName || '(映射表亦无)', x.backfilled ? '是（用映射表名称）' : '否（节点名用编码）'];
      })));
      wsn['!cols'] = [{ wch: 12 }, { wch: 14 }, { wch: 34 }, { wch: 22 }];
      XLSX.utils.book_append_sheet(wb, wsn, job.name + '名称补齐');
    }
    console.log('');
  });
  const wsSum = XLSX.utils.aoa_to_sheet(summaryRows);
  wsSum['!cols'] = [{ wch: 10 }, { wch: 9 }, { wch: 9 }, { wch: 14 }, { wch: 11 }, { wch: 10 }, { wch: 8 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, wsSum, '总览');
  XLSX.writeFile(wb, OUT_XLSX);
  console.log('已生成清单: ' + OUT_XLSX + '（每岗位一个未匹配 sheet + 总览）');
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

function runJobImport(db, job, map, effMap, rootNode, includeUnmatched) {
  const created = [];
  const ensureNode = makeEnsurer(db, created);
  const tx = db.transaction(function () {
    // 第一步：按映射表幂等建全量真实组织树（与 v1 同口径；已存在的节点不重复建。
    // 注意用原 map 而非 effMap，避免店名别名条目重复建树）
    for (const e of map.values()) {
      const rid = ensureNode(e.region, '大区', rootNode.id, null);
      const aid = ensureNode(e.area, '小区', rid, null);
      ensureNode(e.name || '门店(未命名)', '门店', aid, null);
    }
    // 第二步：评分落库（虚拟人员 + 明细 + 汇总；orgMap 用含店名别名的 effMap）
    return importScoring(db, fs.readFileSync(job.file), path.basename(job.file), {
      postKey: job.key, orgMap: effMap, virtual: true, includeUnmatched: includeUnmatched, rootId: rootNode.id
    });
  });
  const r = tx();
  const report = {
    postKey: r.postKey, postName: r.postName, includeUnmatched: !!includeUnmatched,
    detailRows: r.detailRows, sumRows: r.sumRows, persons: r.persons,
    skippedStores: r.skippedStores, unmatchedStores: r.unmatchedStores,
    nameBackfilled: r.nameBackfilled, days: r.days,
    createdNodeIds: created.concat(r.createdNodeIds),
    personIds: r.personIds
  };
  const log = db.prepare('INSERT INTO import_logs (type, filename, rows_ok, rows_failed, report_json) VALUES (?,?,?,?,?)')
    .run(LOG_TYPE, '[' + job.name + ']' + path.basename(job.file) + ' + ' + path.basename(MAP_FILE), r.detailRows + r.sumRows,
      r.skippedStores.reduce(function (a, s) { return a + s.rows * 2; }, 0), JSON.stringify(report));
  console.log('---- ' + job.name + ' 导入完成 ----');
  console.log('  批次号  : #' + log.lastInsertRowid);
  console.log('  新建节点: 树 ' + created.length + ' 个 + 评分过程 ' + r.createdNodeIds.length + ' 个（岗位/虚拟人员等）');
  console.log('  明细行  : ' + r.detailRows + ' / 汇总行: ' + r.sumRows + ' / 人员: ' + r.persons);
  console.log('  店名补齐: ' + r.nameBackfilled.length + ' 家');
  if (r.skippedStores.length) {
    console.log('  跳过门店: ' + r.skippedStores.length + ' 家（未命中映射）');
    r.skippedStores.slice(0, 10).forEach(function (s) { console.log('    ' + s.code + ' 跳过 ' + s.rows + ' 行'); });
    if (r.skippedStores.length > 10) console.log('    … 其余 ' + (r.skippedStores.length - 10) + ' 家');
  }
  return { batchId: Number(log.lastInsertRowid), report: report };
}

function runImport(db, includeUnmatched) {
  const map = parseMap(MAP_FILE);
  const rootNode = db.prepare("SELECT id FROM org_nodes WHERE level = '全国' ORDER BY id LIMIT 1").get();
  if (!rootNode) throw new Error('数据库中无「全国」根节点');
  console.log('================ 多岗位导入（' + (includeUnmatched ? '含未匹配门店' : '仅命中门店') + '） ================');
  const done = [];
  for (const job of JOBS) {
    try {
      const aug = augmentMapByName(map, job.file);
      if (aug.aliasCount) console.log('[' + job.name + '] 店名别名 ' + aug.aliasCount + ' 个数字编码对齐映射表' + (aug.unmatchedNames.length ? '（未对上: ' + aug.unmatchedNames.join('、') + '）' : ''));
      done.push(Object.assign({ job: job }, runJobImport(db, job, map, aug.effective, rootNode, includeUnmatched)));
    } catch (e) {
      console.error('---- ' + job.name + ' 导入失败（已回滚该岗位，继续下一岗位）----');
      console.error('  错误: ' + e.message);
      process.exitCode = 1;
    }
  }
  console.log('');
  console.log('共完成 ' + done.length + '/' + JOBS.length + ' 个岗位；批次号: ' + done.map(function (d) { return d.job.name + '=#' + d.batchId; }).join('，'));
  if (done.length) console.log('（回滚指定岗位用：node scripts/import-multi_v5.4.js rollback <batchId>）');
}

// ------------------------------------------------------------ 状态 / 回滚

function status(db) {
  const logs = db.prepare("SELECT * FROM import_logs WHERE type = ? ORDER BY id DESC LIMIT 12").all(LOG_TYPE);
  console.log('================ 导入批次（最近 12 条） ================');
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
  console.log('');
  console.log('---- 各岗位评分存量 ----');
  ALL_POST_KEYS.forEach(function (pk) {
    const cnt = db.prepare("SELECT COUNT(*) AS rows, COUNT(DISTINCT person_id) AS persons, COUNT(DISTINCT store_id) AS stores, MIN(date) AS d1, MAX(date) AS d2 FROM action_scores WHERE post_key = ?").get(pk);
    const sums = db.prepare("SELECT COUNT(*) AS c FROM action_daily_sums WHERE post_key = ?").get(pk);
    console.log('  ' + pk.padEnd(20) + ' 明细 ' + String(cnt.rows).padStart(6) + ' 行 / 汇总 ' + String(sums.c).padStart(6) + ' 行 / ' +
      String(cnt.persons).padStart(4) + ' 人 / ' + String(cnt.stores).padStart(4) + ' 店 / ' + (cnt.d1 || '-') + '~' + (cnt.d2 || '-'));
  });
}

function rollback(db, batchId) {
  let log;
  if (batchId) {
    log = db.prepare("SELECT * FROM import_logs WHERE type = ? AND id = ?").get(LOG_TYPE, batchId);
    if (!log) throw new Error('找不到批次 #' + batchId);
    if ((log.report_json || '').indexOf('"rolledBackAt"') >= 0) throw new Error('批次 #' + batchId + ' 已回滚过');
  } else {
    log = db.prepare("SELECT * FROM import_logs WHERE type = ? AND report_json NOT LIKE '%\"rolledBackAt\"%' ORDER BY id DESC LIMIT 1").get(LOG_TYPE);
    if (!log) throw new Error('没有可回滚的批次（都回滚过或从未导入）');
  }
  const rp = JSON.parse(log.report_json || '{}');
  const personIds = rp.personIds || [], nodeIds = rp.createdNodeIds || [];
  console.log('即将回滚批次 #' + log.id + '（' + (rp.postKey || '?') + '）：人员 ' + personIds.length + ' 个 / 节点 ' + nodeIds.length + ' 个');
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
  console.log('回滚完成：批次 #' + log.id + ' 的评分数据、人员、该批新建组织节点已删除（日志保留并标记已回滚）');
}

// ------------------------------------------------------------ 入口

const mode = process.argv[2] || 'menu';
const arg3 = process.argv[3];
const db = dbh.openDb();
try {
  if (mode === 'preview') preview();
  else if (mode === 'import') runImport(db, false);
  else if (mode === 'import-all') runImport(db, true);
  else if (mode === 'status') status(db);
  else if (mode === 'rollback') rollback(db, arg3 ? Number(arg3) : null);
  else if (mode === 'menu') {
    console.log('v5.4 多岗位真实数据导入（产品专家/交付店长/交付专员/数营专家）——请用 bat 菜单或直接传参：preview / import / import-all / status / rollback [batchId]');
    status(db);
  } else throw new Error('未知模式: ' + mode);
} catch (e) {
  console.error('执行失败: ' + e.message);
  process.exitCode = 1;
} finally {
  db.close();
}
