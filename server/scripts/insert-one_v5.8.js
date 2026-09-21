'use strict';
/**
 * v5.8 单人积分补录交互 CLI
 *
 * 用途：某门店某人员的「积分动作明细」单条/少量补录或修正，替代手写 SQL。
 * 写入口径与 import-multi_v5.4.js 一致：action_scores 明细 + action_daily_sums 日汇总同事务，
 * 并写 import_logs（type='scoring'，mode='manual-one'/'manual-del'）留痕，可按批次精确回滚
 * （回滚用快照恢复，覆盖/删除前的原值原样还原）。
 *
 * 汇总口径说明（重要）：
 *   逐日表 /api/scoring/range 主口径读 action_daily_sums。批量导入的 cnt 是「次数」语义
 *   （≠ 明细行数）。因此本工具对已存在的导入汇总行只做 score 增量调整（cnt/target 不动），
 *   仅在没有汇总行时新建一条（cnt=明细数, target='', target_score=0 → 前端回退规则封顶）。
 *
 * 命令模式：
 *   node scripts/insert-one_v5.8.js add --emp 233813 --date 2026-09-10 --item 首访完成率 --action 首次到店接待 --score 0.1 --evidence "已满足【规则：首访当日建卡】；订单1-1-3" --order 1-1-3
 *   node scripts/insert-one_v5.8.js list --emp 233813 [--date 2026-09-10]
 *   node scripts/insert-one_v5.8.js del --id 12345
 *   node scripts/insert-one_v5.8.js rollback            回滚最近一个未回滚的 manual 批次
 *   node scripts/insert-one_v5.8.js rollback 20         回滚指定批次
 *   node scripts/insert-one_v5.8.js status              查看最近 manual 批次
 *
 * 交互模式：无参数运行进入中文菜单（由 积分补录_v5.8.bat 双击驱动）。
 *
 * 约定（与前端呈现强相关，勿破坏）：
 *   date 必须 YYYY-MM-DD；ok = score>=0?1:0；
 *   evidence 推荐「结论【规则：…】；」句式（已满足/未满足/不满足 前缀），
 *   否则抽屉「AI 证据链 / 扣分明细」可能解析不出结构。
 */
const readline = require('readline');
const dbh = require('../db');
const { clean, toNum, normDate } = require('../services/actionScoring_v4.6');

const LOG_TYPE = 'scoring';
const DETAIL_COLS = ['id', 'person_id', 'emp_no', 'person_name', 'post_key', 'store_id', 'store_code', 'store_name', 'date', 'item', 'action', 'score', 'ok', 'evidence', 'order_no'];
const SUM_COLS = ['person_id', 'emp_no', 'post_key', 'store_id', 'date', 'item', 'target', 'cnt', 'target_score', 'score'];

// ------------------------------------------------------------ 人员解析与路径

function nodeById(db, id) {
  return db.prepare('SELECT id, name, level, parent_id, post_key, emp_no, status FROM org_nodes WHERE id = ?').get(id);
}

/** 人员 → 自底向上祖先链（含自身） */
function personChain(db, personId) {
  const chain = [];
  let cur = nodeById(db, personId);
  while (cur) {
    chain.push(cur);
    if (cur.parent_id === null) break;
    cur = nodeById(db, cur.parent_id);
  }
  return chain;
}

function pathText(db, personId) {
  return personChain(db, personId).reverse().map(function (n) { return n.name; }).join(' > ');
}

/** 从祖先链取门店/岗位信息 + 冗余 store_code（从该店已有评分行借用） */
function locate(db, personId) {
  const chain = personChain(db, personId);
  const store = chain.find(function (n) { return n.level === '门店'; }) || null;
  const postNode = chain.find(function (n) { return n.level === '岗位'; }) || null;
  const person = chain[0];
  let storeCode = null;
  if (store) {
    const prev = db.prepare("SELECT store_code FROM action_scores WHERE store_id = ? AND store_code IS NOT NULL AND store_code != '' ORDER BY id DESC LIMIT 1").get(store.id);
    storeCode = prev ? prev.store_code : null;
  }
  const postKey = person.post_key || (postNode ? postNode.post_key : null) || null;
  return {
    personId: person.id, personName: person.name, empNo: person.emp_no || null,
    postKey: postKey, postName: postNode ? postNode.name : '(未知岗位)',
    storeId: store ? store.id : null, storeCode: storeCode, storeName: store ? store.name : null,
    path: chain.reverse().map(function (n) { return n.name; }).join(' > ')
  };
}

/** 按工号精确查人；查不到按姓名模糊搜（多候选交调用方选择） */
function resolvePerson(db, empOrName) {
  const p = dbh.findPersonByEmpNo(db, empOrName);
  if (p) return { picked: p };
  const like = '%' + empOrName + '%';
  const cands = db.prepare("SELECT id, name, emp_no, status FROM org_nodes WHERE level = '人员' AND name LIKE ? ORDER BY status DESC, id LIMIT 20").all(like);
  return { picked: null, candidates: cands };
}

// ------------------------------------------------------------ 快照 / 恢复（回滚用）

function snapDetail(db, id) {
  return id ? db.prepare('SELECT * FROM action_scores WHERE id = ?').get(id) : null;
}

function restoreDetail(db, row) {
  if (!row) return;
  db.prepare('INSERT OR REPLACE INTO action_scores (' + DETAIL_COLS.join(',') + ') VALUES (' + DETAIL_COLS.map(function () { return '?'; }).join(',') + ')')
    .run(...DETAIL_COLS.map(function (c) { return row[c] === undefined ? null : row[c]; }));
}

function snapSum(db, personId, date, item) {
  return db.prepare('SELECT ' + SUM_COLS.join(',') + ' FROM action_daily_sums WHERE person_id = ? AND date = ? AND item = ?')
    .get(personId, date, item) || null;
}

function restoreSum(db, s) {
  if (!s) return;
  db.prepare('INSERT OR REPLACE INTO action_daily_sums (' + SUM_COLS.join(',') + ') VALUES (' + SUM_COLS.map(function () { return '?'; }).join(',') + ')')
    .run(...SUM_COLS.map(function (c) { return s[c] === undefined ? null : s[c]; }));
}

function deleteSum(db, personId, date, item) {
  db.prepare('DELETE FROM action_daily_sums WHERE person_id = ? AND date = ? AND item = ?').run(personId, date, item);
}

// ------------------------------------------------------------ 汇总增量维护

/**
 * 明细变化后维护日汇总：
 *   - 无汇总行且还有明细：新建 manual 行（cnt=明细数, target='', target_score=0 → 前端 std 回退规则封顶）
 *   - 已有汇总行且无剩余明细：删行（明细都不在了，空汇总无意义）
 *   - 已有「manual 特征」行（target 空且 target_score=0，已验证导入行 3819/3820 均不满足）：按明细重算 cnt/score
 *   - 已有导入行：只调 score（delta = 新明细分 - 旧明细分），cnt/target/target_score 不动（导入 cnt 是次数语义 ≠ 行数）
 * 返回操作摘要。
 */
function applySum(db, loc, date, item, deltaScore) {
  const agg = db.prepare('SELECT COUNT(*) AS cnt, COALESCE(SUM(score), 0) AS score FROM action_scores WHERE person_id = ? AND date = ? AND item = ?')
    .get(loc.personId, date, item);
  const cur = snapSum(db, loc.personId, date, item);
  if (!cur) {
    if (!agg.cnt) return { noop: true };
    db.prepare(`INSERT INTO action_daily_sums (person_id, emp_no, post_key, store_id, date, item, target, cnt, target_score, score)
      VALUES (?, ?, ?, ?, ?, ?, '', ?, 0, ?)`)
      .run(loc.personId, loc.empNo, loc.postKey, loc.storeId, date, item, agg.cnt, agg.score);
    return { created: true, cnt: agg.cnt, score: agg.score };
  }
  if (!agg.cnt) {
    deleteSum(db, loc.personId, date, item);
    return { removed: true };
  }
  const manualLike = (cur.target === null || cur.target === '') && !Number(cur.target_score);
  if (manualLike) {
    db.prepare('UPDATE action_daily_sums SET cnt = ?, score = ? WHERE person_id = ? AND date = ? AND item = ?')
      .run(agg.cnt, agg.score, loc.personId, date, item);
    return { recomputed: true, cnt: agg.cnt, score: agg.score };
  }
  db.prepare('UPDATE action_daily_sums SET score = ? WHERE person_id = ? AND date = ? AND item = ?')
    .run(Number(cur.score) + deltaScore, loc.personId, date, item);
  return { adjusted: true, cnt: cur.cnt, score: Number(cur.score) + deltaScore, target: cur.target };
}

/** 汇总操作摘要的可读描述 */
function sumDesc(sum) {
  if (!sum) return '（无汇总行）';
  if (sum.created) return '新建 cnt=' + sum.cnt + ' score=' + sum.score;
  if (sum.removed) return '汇总行已删（无剩余明细）';
  if (sum.recomputed) return '重算 cnt=' + sum.cnt + ' score=' + sum.score;
  if (sum.adjusted) return 'score→' + sum.score + '（cnt=' + sum.cnt + ' 不动）';
  return '（无变化）';
}

// ------------------------------------------------------------ 校验提示

/** 证据句式检测：缺「已满足/未满足/不满足」结论前缀时警告（不阻断） */
function evidenceWarn(ev) {
  if (!ev) return '（空）——抽屉证据链将无内容，建议补「结论【规则：…】；」句式';
  if (!/(已满足|未满足|不满足)/.test(ev)) return '未检出「已满足/未满足/不满足」结论前缀，抽屉 AI 证据链可能解析不出结构';
  if (!/【/.test(ev)) return '未检出【规则】括注，建议写成「结论【规则：…】；」';
  return null;
}

// ------------------------------------------------------------ add / del / list / rollback

/**
 * 补录一条明细（幂等：UNIQUE(person_id,date,item,action,order_no) 冲突时覆盖）+ 汇总增量 + 留痕（含回滚快照）
 * opts: { emp, personId, date, item, action, score, evidence, order, interactive, confirmed }
 * 交互模式且未 confirmed：仅解析+展示，返回 { needConfirm: true }；确认后带 confirmed=true 再调一次真正写库。
 */
function addRecord(db, opts) {
  const date = normDate(opts.date);
  if (!date) throw new Error('日期格式必须为 YYYY-MM-DD（收到: ' + clean(opts.date) + '）');
  const item = clean(opts.item);
  if (!item) throw new Error('拿分项(item)不能为空');
  const action = clean(opts.action);
  const score = toNum(opts.score);
  const evidence = clean(opts.evidence);
  const orderNo = clean(opts.order);

  let person = null;
  if (opts.personId) {
    person = nodeById(db, Number(opts.personId));
    if (!person || person.level !== '人员') throw new Error('personId=' + opts.personId + ' 不是人员节点');
  } else {
    const res = resolvePerson(db, clean(opts.emp));
    person = res.picked;
    if (!person) {
      if (!res.candidates || !res.candidates.length) {
        throw new Error('按工号/姓名均未找到人员「' + clean(opts.emp) + '」。补录前提是人员已在组织树上（先走批量导入建人），本工具不自动建人。');
      }
      if (opts.interactive && !opts.confirmed) return { needPick: res.candidates };
      console.log('工号未命中，按姓名找到候选：');
      res.candidates.forEach(function (c, i) {
        console.log('  [' + (i + 1) + '] ' + c.name + (c.emp_no ? '（' + c.emp_no + '）' : '（无工号）') + (c.status ? '' : ' [已停用]') + '  路径: ' + pathText(db, c.id));
      });
      throw new Error('工号未命中且有 ' + res.candidates.length + ' 个姓名候选，请用工号重试（--emp）');
    }
  }
  const loc = locate(db, person.id);
  if (!loc.postKey) throw new Error('该人员节点无 post_key（岗位归属缺失），请先在组织树上修复归属');
  if (!loc.storeId) throw new Error('该人员路径上未找到门店节点，无法落库门店归属');

  console.log('── 人员确认 ──');
  console.log('  ' + loc.personName + (loc.empNo ? '（' + loc.empNo + '）' : '') + '  id=' + loc.personId);
  console.log('  路径: ' + loc.path);
  console.log('  岗位: ' + loc.postName + '（' + loc.postKey + '）');
  console.log('  门店: ' + loc.storeName + (loc.storeCode ? '  编码 ' + loc.storeCode : '（无编码）'));
  console.log('── 待写入 ──');
  console.log('  日期 ' + date + '  拿分项 ' + item + '  动作 ' + (action || '(空)') + '  分值 ' + score + '  订单号 ' + (orderNo || '(空)'));
  const warn = evidenceWarn(evidence);
  if (warn) console.log('  [证据提示] ' + warn);
  else console.log('  证据: ' + (evidence.length > 60 ? evidence.slice(0, 60) + '…' : evidence));

  const exist = db.prepare('SELECT id, score FROM action_scores WHERE person_id = ? AND date = ? AND item = ? AND action = ? AND order_no = ?')
    .get(loc.personId, date, item, action, orderNo);
  if (exist) console.log('  [覆盖] 已存在同键明细 id=' + exist.id + '（score=' + exist.score + '），本次将覆盖。');

  // 新拿分项提示：逐日表积分/完成率只统计前端规则表（lighthouse_scoring_v4.6.js 的 LH.postRules）
  // 中的拿分项；该岗位从未出现过的拿分项不计入积分列，仅在诊断抽屉明细/证据链中可见。
  const known = db.prepare('SELECT COUNT(*) AS c FROM action_scores WHERE post_key = ? AND item = ?').get(loc.postKey, item).c;
  if (!known) console.log('  [新拿分项] 该岗位（' + loc.postKey + '）此前无「' + item + '」记录：逐日表的积分/完成率仅统计规则表拿分项，此项不会改变积分列，仅在抽屉明细与证据链中可见。');

  if (opts.interactive && !opts.confirmed) return { needConfirm: true };

  const out = db.transaction(function () {
    const prevDetail = exist ? snapDetail(db, exist.id) : null;
    const prevSum = snapSum(db, loc.personId, date, item);
    let rowId;
    if (exist) {
      db.prepare('UPDATE action_scores SET emp_no=?, person_name=?, post_key=?, store_id=?, store_code=?, store_name=?, score=?, ok=?, evidence=? WHERE id=?')
        .run(loc.empNo, loc.personName, loc.postKey, loc.storeId, loc.storeCode, loc.storeName, score, score >= 0 ? 1 : 0, evidence || null, exist.id);
      rowId = exist.id;
    } else {
      const r = db.prepare(`INSERT INTO action_scores
        (person_id, emp_no, person_name, post_key, store_id, store_code, store_name, date, item, action, score, ok, evidence, order_no)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(loc.personId, loc.empNo, loc.personName, loc.postKey, loc.storeId, loc.storeCode, loc.storeName,
          date, item, action, score, score >= 0 ? 1 : 0, evidence || null, orderNo);
      rowId = Number(r.lastInsertRowid);
    }
    const delta = score - (exist ? Number(exist.score) : 0);
    const sum = applySum(db, loc, date, item, delta);
    const report = {
      mode: 'manual-one', empNo: loc.empNo, personId: loc.personId, personName: loc.personName,
      date: date, item: item, action: action, score: score, orderNo: orderNo,
      scoreRowIds: [rowId], storeId: loc.storeId, postKey: loc.postKey,
      prevDetail: prevDetail, sumBefore: prevSum, sum: sum
    };
    const log = db.prepare('INSERT INTO import_logs (type, filename, rows_ok, rows_failed, report_json) VALUES (?,?,?,?,?)')
      .run(LOG_TYPE, '[manual-one]' + (loc.empNo || loc.personId) + ' ' + date + ' ' + item, 1, 0, JSON.stringify(report));
    return { rowId: rowId, sum: sum, batchId: Number(log.lastInsertRowid), covered: !!exist };
  })();
  return Object.assign({ ok: true, loc: loc, date: date, item: item }, out);
}

/** 删除单条明细 + 汇总增量（留痕 mode='manual-del'，含恢复快照） */
function delRecord(db, id) {
  const row = db.prepare('SELECT * FROM action_scores WHERE id = ?').get(Number(id));
  if (!row) throw new Error('action_scores 中无 id=' + id + ' 的明细行');
  const loc = locate(db, row.person_id);
  console.log('即将删除：id=' + row.id + '  ' + row.date + ' ' + row.item + ' ' + (row.action || '') + ' score=' + row.score + ' 订单 ' + (row.order_no || '(空)'));
  const out = db.transaction(function () {
    const prevSum = snapSum(db, row.person_id, row.date, row.item);
    db.prepare('DELETE FROM action_scores WHERE id = ?').run(row.id);
    const sum = applySum(db, loc, row.date, row.item, -Number(row.score));
    const report = { mode: 'manual-del', personId: row.person_id, empNo: row.emp_no, date: row.date, item: row.item, scoreRowIds: [row.id], deletedDetail: row, sumBefore: prevSum, sum: sum };
    const log = db.prepare('INSERT INTO import_logs (type, filename, rows_ok, rows_failed, report_json) VALUES (?,?,?,?,?)')
      .run(LOG_TYPE, '[manual-del]#' + row.id, 0, 1, JSON.stringify(report));
    return { sum: sum, batchId: Number(log.lastInsertRowid) };
  })();
  console.log('删除完成：明细 #' + row.id + '，汇总 ' + sumDesc(out.sum));
  return { ok: true, deletedId: row.id, date: row.date, item: row.item };
}

/** 查看某人员的明细（可按日期过滤） */
function listRecords(db, emp, date) {
  const res = resolvePerson(db, clean(emp));
  if (!res.picked) {
    if (!res.candidates || !res.candidates.length) throw new Error('未找到人员「' + emp + '」');
    res.candidates.forEach(function (c, i) {
      console.log('[' + (i + 1) + '] ' + c.name + (c.emp_no ? '（' + c.emp_no + '）' : '') + '  路径: ' + pathText(db, c.id));
    });
    return { ok: false };
  }
  const loc = locate(db, res.picked.id);
  console.log('── ' + loc.personName + (loc.empNo ? '（' + loc.empNo + '）' : '') + '  id=' + loc.personId + ' ──');
  console.log('  路径: ' + loc.path);
  const d = date ? normDate(date) : null;
  if (date && !d) throw new Error('日期格式必须为 YYYY-MM-DD');
  const qd = d ? ' AND date = ?' : '';
  const args = d ? [loc.personId, d] : [loc.personId];
  const rows = db.prepare('SELECT id, date, item, action, score, ok, evidence, order_no FROM action_scores WHERE person_id = ?' + qd + ' ORDER BY date, item, id').all(...args);
  const sums = db.prepare('SELECT date, item, cnt, target, target_score, score FROM action_daily_sums WHERE person_id = ?' + qd + ' ORDER BY date, item').all(...args);
  console.log('  明细 ' + rows.length + ' 行 / 日汇总 ' + sums.length + ' 行' + (d ? '（' + d + '）' : ''));
  rows.forEach(function (r) {
    console.log('    #' + r.id + '  ' + r.date + '  ' + r.item + '  ' + (r.action || '(空动作)') + '  ' + (r.score >= 0 ? '+' : '') + r.score + (r.ok ? '' : ' [未达成]') + (r.order_no ? '  订单' + r.order_no : ''));
    if (r.evidence) console.log('        证据: ' + (r.evidence.length > 72 ? r.evidence.slice(0, 72) + '…' : r.evidence));
  });
  sums.forEach(function (s) {
    console.log('    汇总  ' + s.date + '  ' + s.item + '  cnt=' + s.cnt + ' score=' + s.score + (s.target ? '  目标 ' + s.target : ''));
  });
  return { ok: true, rows: rows.length };
}

/**
 * 回滚 manual 批次（快照精确恢复）：
 *   manual-one：有 prevDetail → 原值还原明细；无 → 删明细。sumBefore 有 → 还原汇总行；无 → 删汇总行。
 *   manual-del：restoreDetail 恢复被删明细；sumBefore 有 → 还原；无 → 删汇总行。
 * 注意：连续多次补录后应按时间倒序回滚（后做的先回滚），否则旧快照会覆盖新数据。
 */
function rollback(db, batchId) {
  let log;
  if (batchId) {
    log = db.prepare("SELECT * FROM import_logs WHERE type = ? AND id = ?").get(LOG_TYPE, batchId);
    if (!log) throw new Error('找不到批次 #' + batchId);
    if ((log.report_json || '').indexOf('"rolledBackAt"') >= 0) throw new Error('批次 #' + batchId + ' 已回滚过');
  } else {
    log = db.prepare("SELECT * FROM import_logs WHERE type = ? AND report_json LIKE '%\"manual-%' AND report_json NOT LIKE '%\"rolledBackAt\"%' ORDER BY id DESC LIMIT 1").get(LOG_TYPE);
    if (!log) throw new Error('没有可回滚的 manual 批次');
  }
  const rp = JSON.parse(log.report_json || '{}');
  if (!/manual-(one|del)/.test(rp.mode || '')) throw new Error('批次 #' + log.id + ' 不是 manual 补录批次（mode=' + (rp.mode || '?') + '），请用 import-multi_v5.4.js rollback 处理导入批次');
  console.log('即将回滚批次 #' + log.id + '（' + rp.mode + ' ' + (rp.empNo || rp.personId) + ' ' + rp.date + ' ' + (rp.item || '') + '）');
  db.transaction(function () {
    if (rp.mode === 'manual-one') {
      if (rp.prevDetail) restoreDetail(db, rp.prevDetail);
      else rp.scoreRowIds.forEach(function (id) { db.prepare('DELETE FROM action_scores WHERE id = ?').run(id); });
    } else if (rp.mode === 'manual-del') {
      restoreDetail(db, rp.deletedDetail);
    }
    if (rp.sumBefore) restoreSum(db, rp.sumBefore);
    else if (rp.date && rp.item) deleteSum(db, rp.personId, rp.date, rp.item);
    rp.rolledBackAt = new Date().toISOString().slice(0, 19).replace('T', ' ');
    db.prepare('UPDATE import_logs SET report_json = ? WHERE id = ?').run(JSON.stringify(rp), log.id);
  })();
  console.log('回滚完成：明细与汇总已按快照恢复（日志保留并标记已回滚）');
  return { ok: true };
}

/** 最近 manual 批次状态 */
function statusManual(db) {
  const logs = db.prepare("SELECT * FROM import_logs WHERE type = ? AND report_json LIKE '%\"manual-%' ORDER BY id DESC LIMIT 10").all(LOG_TYPE);
  console.log('================ 最近 10 条 manual 补录批次 ================');
  if (!logs.length) console.log('（无）');
  logs.forEach(function (l) {
    let extra = '';
    try {
      const rp = JSON.parse(l.report_json || '{}');
      extra = '  ' + (rp.mode || '?') + ' ' + (rp.empNo || rp.personId || '?') + ' ' + (rp.date || '') + ' ' + (rp.item || '') +
        '  score=' + (rp.score != null ? rp.score : '') +
        (rp.rolledBackAt ? '  [已回滚 ' + rp.rolledBackAt + ']' : '');
    } catch (e) { /* ignore */ }
    console.log('#' + l.id + '  ' + l.uploaded_at + '  ' + l.filename + extra);
  });
}

// ------------------------------------------------------------ 参数与交互

function parseArgs(argv) {
  const out = { cmd: argv[0] || 'menu', _: [] };
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (/^--/.test(a)) { out[a.slice(2)] = argv[i + 1] !== undefined ? argv[i + 1] : true; i++; }
    else out._.push(a);
  }
  return out;
}

function ask(rl, q) {
  return new Promise(function (resolve) { rl.question(q, resolve); });
}

async function interactive(db) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  console.log('================ 积分补录 v5.8（单人明细） ================');
  console.log('命令：add 补录 / list 查看 / del 删除 / rollback 回滚 / status 批次 / quit 退出');
  console.log('提示：rollback 请按时间倒序回滚最近的批次，避免旧快照覆盖新数据。');
  try {
    for (;;) {
      const cmd = (await ask(rl, '\n> ')).trim();
      if (!cmd) continue;
      const c = cmd.split(/\s+/)[0].toLowerCase();
      try {
        if (c === 'quit' || c === 'exit' || c === 'q') break;
        else if (c === 'status') statusManual(db);
        else if (c === 'list') {
          const emp = await ask(rl, '工号或姓名: ');
          const date = (await ask(rl, '日期(YYYY-MM-DD，回车=全部): ')).trim();
          listRecords(db, emp, date || null);
        }
        else if (c === 'add') {
          const o = { interactive: true };
          o.emp = (await ask(rl, '工号或姓名: ')).trim();
          o.date = (await ask(rl, '日期(YYYY-MM-DD): ')).trim();
          o.item = (await ask(rl, '拿分项(如 首访完成率): ')).trim();
          o.action = (await ask(rl, '动作(可回车): ')).trim();
          o.score = (await ask(rl, '分值(正=得分 负=扣分，如 0.1 / -0.06): ')).trim();
          o.evidence = (await ask(rl, '证据(推荐 结论【规则：…】； 句式): ')).trim();
          o.order = (await ask(rl, '订单号(可回车): ')).trim();
          let r = addRecord(db, o);
          if (r.needPick) {
            r.candidates.forEach(function (c2, i) {
              console.log('  [' + (i + 1) + '] ' + c2.name + (c2.emp_no ? '（' + c2.emp_no + '）' : '') + (c2.status ? '' : ' [已停用]') + '  路径: ' + pathText(db, c2.id));
            });
            const pick = (await ask(rl, '按工号未命中，请选择候选编号（回车取消）: ')).trim();
            if (!pick) { console.log('已取消。'); continue; }
            const sel = r.candidates[Number(pick) - 1];
            if (!sel) { console.log('编号无效，已取消。'); continue; }
            o.personId = sel.id;
            r = addRecord(db, o);
          }
          if (r.needConfirm) {
            const sure = (await ask(rl, '确认写入？(y=写入 回车=取消): ')).trim().toLowerCase();
            if (sure !== 'y' && sure !== 'yes') { console.log('已取消。'); continue; }
            r = addRecord(db, Object.assign({}, o, { confirmed: true }));
          }
          if (r.ok) {
            console.log('写入成功：明细 id=' + r.rowId + ' 批次 #' + r.batchId + (r.covered ? '（覆盖旧行）' : '') + ' 汇总 ' + sumDesc(r.sum));
            console.log('（回滚：rollback ' + r.batchId + '）');
          }
        }
        else if (c === 'del') {
          const id = (await ask(rl, '明细行 id（list 可查）: ')).trim();
          const sure = (await ask(rl, '确认删除？(y=删 回车=取消): ')).trim().toLowerCase();
          if (sure === 'y' || sure === 'yes') delRecord(db, id);
          else console.log('已取消。');
        }
        else if (c === 'rollback') {
          const id = (await ask(rl, '批次号(回车=最近一个未回滚): ')).trim();
          rollback(db, id ? Number(id) : null);
        }
        else console.log('未知命令: ' + c);
      } catch (e) {
        console.error('错误: ' + e.message);
      }
    }
  } finally { rl.close(); }
}

// ------------------------------------------------------------ 入口

const argv = process.argv.slice(2);
const a = parseArgs(argv);
const db = dbh.openDb();
try {
  if (a.cmd === 'add') {
    const r = addRecord(db, { emp: a.emp, date: a.date, item: a.item, action: a.action, score: a.score, evidence: a.evidence, order: a.order });
    if (r.ok) {
      console.log('写入成功：明细 id=' + r.rowId + ' 批次 #' + r.batchId + (r.covered ? '（覆盖旧行）' : '') + ' 汇总 ' + sumDesc(r.sum));
      console.log('（回滚：node scripts/insert-one_v5.8.js rollback ' + r.batchId + '）');
    }
  } else if (a.cmd === 'list') {
    listRecords(db, a.emp, a.date || null);
  } else if (a.cmd === 'del') {
    delRecord(db, a.id);
  } else if (a.cmd === 'rollback') {
    rollback(db, a._[0] ? Number(a._[0]) : (typeof a.batch === 'string' ? Number(a.batch) : null));
  } else if (a.cmd === 'status') {
    statusManual(db);
  } else if (a.cmd === 'menu' || a.cmd === 'interactive') {
    interactive(db).then(function () { db.close(); }, function (e) { console.error('交互异常: ' + e.message); process.exitCode = 1; db.close(); });
  } else throw new Error('未知命令: ' + a.cmd);
} catch (e) {
  console.error('执行失败: ' + e.message);
  process.exitCode = 1;
  db.close();
}
