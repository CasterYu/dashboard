'use strict';
/**
 * Excel/CSV 导入服务（v4）
 *
 * 名册（org）：
 *   - 人员以「工号」为唯一标识（工号列可选，缺失时降级姓名匹配并告警）
 *   - mode=merge（默认）：只新增与调岗，不做离职判定
 *   - mode=snapshot：以文件涉及的大区为范围，名单外节点停用、重新出现即恢复；未涉及的大区不动
 *   - dryRun=1：在同一事务内完整演算后回滚，只返回差异报告（不写库）
 *   - 调岗：关闭旧任职段（生效日前一日）+ 开新段 + 迁移节点 → 历史按当时架构归属
 *
 * 指标（metrics）：同人同日覆盖；优先按工号定位人员，回退「门店+姓名」
 */
const XLSX = require('xlsx');
const {
  METRIC_COLS, METRIC_KEYS, findOrCreateNode, createPersonNode, buildPersonPaths, transferPerson,
  OPEN_FROM, setPersonEmpNo, setNodeStatus, openAssignment, createAssignment
} = require('../db');
const { normEmpNo, empNoError, EMP_NO_HEADERS } = require('./personIdentity');

// 指标列中文名 → 驼峰 key（与前端 METRIC_LABEL 一致）
const METRIC_LABELS = {
  '线索量': 'leads', '有效线索': 'validLeads', '意向线索': 'intentLeads', '邀约排程': 'invites',
  '到店量': 'arrivals', '有效试驾': 'testDrives', '试驾点评数': 'testReviews', '二次回访': 'returnVisits',
  '商机量': 'opportunities', '锁单量': 'locked', '交付量': 'delivered'
};

const ORG_HEADERS = ['大区', '小区', '门店', '岗位', '人员', '工号', '生效日期'];
const METRICS_HEADERS = ['日期', '门店', '人员', '岗位', '工号'].concat(Object.keys(METRIC_LABELS));

const LIST_CAP = 200;              // 报告内各清单最多回显条数（计数不受影响）
const DEACTIVATE_MIN = 5;          // 安全阀：停用数量下限
const DEACTIVATE_RATIO = 0.2;      // 安全阀：停用占比上限

class ImportConflict extends Error {
  constructor(message, report) {
    super(message);
    this.name = 'ImportConflict';
    this.statusCode = 409;
    this.report = report;
  }
}

class DryRunRollback extends Error {
  constructor(report) {
    super('dryRun rollback');
    this.name = 'DryRunRollback';
    this.report = report;
  }
}

/**
 * 极简分隔符文本解析（CSV/TSV）：尊重双引号与转义引号，**文本值原样保留**
 * 自己解析（而非交给 SheetJS 做类型猜测）是为了保住工号的前导零：'007' 必须仍是字符串 '007'
 */
function parseDelimited(text, delim) {
  const table = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false;
      } else field += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === delim) { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); table.push(row); row = []; field = ''; }
    else if (ch !== '\r') field += ch;
  }
  if (field !== '' || row.length) { row.push(field); table.push(row); }
  return table;
}

/** CSV/TSV → [{row, data}]（自动识别逗号/制表符，全空行忽略） */
function parseTextSheet(text) {
  const nl = text.indexOf('\n');
  const firstLine = nl === -1 ? text : text.slice(0, nl);
  const delim = firstLine.split('\t').length > firstLine.split(',').length ? '\t' : ',';
  const table = parseDelimited(text, delim).filter(r => r.some(c => String(c).trim() !== ''));
  if (!table.length) throw new Error('文件中无数据行');
  const headers = table[0].map(h => String(h).replace(/^\uFEFF/, '').trim());
  return table.slice(1).map((cells, i) => {
    const data = {};
    headers.forEach((h, j) => { if (h) data[h] = cells[j] === undefined ? '' : String(cells[j]).trim(); });
    return { row: i + 2, data };   // 表头占第 1 行
  });
}

/** xlsx/xlsm/xls → [{row, data}]；工号列优先取单元格显示文本，避免 Excel 数值化丢前导零 */
function parseWorkbook(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new Error('文件中无工作表');
  const raw = XLSX.utils.sheet_to_json(ws, { defval: '', raw: true, header: 1, blankrows: false });
  const txt = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false, header: 1, blankrows: false });
  if (!raw.length) throw new Error('文件中无数据行');
  const headers = (raw[0] || []).map(h => String(h).trim());
  const empCols = new Set(headers.map((h, j) => (EMP_NO_HEADERS.includes(h.toLowerCase()) ? j : -1)).filter(j => j >= 0));
  return raw.slice(1).map((cells, idx) => {
    const data = {};
    headers.forEach((h, j) => {
      if (!h) return;
      let v = cells[j];
      if (v === null || v === undefined) v = '';
      if (empCols.has(j) && v !== '') {
        const t = txt[idx + 1] ? txt[idx + 1][j] : '';
        v = (typeof v === 'number' && t) ? t : String(v);
      }
      data[h] = v;
    });
    return { row: idx + 2, data };
  });
}

/** 解析上传文件为 [{row: 行号(数据起始=2), data: {列名: 值}}]（按文件魔数分流） */
function parseSheet(buffer) {
  if (!buffer || !buffer.length) throw new Error('文件内容为空');
  const isOle = buffer[0] === 0xd0 && buffer[1] === 0xcf;   // .xls（OLE 复合文档）
  const isZip = buffer[0] === 0x50 && buffer[1] === 0x4b;   // .xlsx/.xlsm（zip）
  if (isOle || isZip) return parseWorkbook(buffer);
  let text = buffer.toString('utf8');
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return parseTextSheet(text);
}

function pick(row, ...names) {
  for (const n of names) {
    if (row[n] !== undefined && String(row[n]).trim() !== '') return String(row[n]).trim();
  }
  return '';
}

/** 取工号列（兼容多种列名） */
function pickEmpNo(row) {
  return pick(row, ...EMP_NO_HEADERS);
}

function toNum(v) {
  if (v === '' || v === null || v === undefined) return 0;
  const n = Number(String(v).replace(/[,，\s]/g, ''));
  return Number.isFinite(n) ? n : NaN;
}

function normDate(v) {
  const s = String(v || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{4})[\/.年](\d{1,2})[\/.月](\d{1,2})日?$/);
  if (m) return `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;
  // Excel 序列日期
  const n = Number(s);
  if (Number.isFinite(n) && n > 20000 && n < 60000) {
    const d = new Date(Math.round((n - 25569) * 86400 * 1000));
    return d.toISOString().slice(0, 10);
  }
  return null;
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// ==================================================================== 名册

/**
 * 名册导入
 * @param {object} db
 * @param {Buffer} buffer
 * @param {string} filename
 * @param {{mode?:'merge'|'snapshot', dryRun?:boolean, force?:boolean, today?:string}} [opts]
 */
function importOrg(db, buffer, filename, opts) {
  const options = Object.assign({ mode: 'merge', dryRun: false, force: false }, opts || {});
  if (options.mode !== 'merge' && options.mode !== 'snapshot') throw new Error('mode 只能是 merge（增量合并）或 snapshot（全量快照）');
  const rows = parseSheet(buffer);
  const today = options.today || todayStr();

  const report = {
    type: 'org', mode: options.mode, dryRun: !!options.dryRun, filename: filename || '',
    rowsTotal: rows.length, rowsOk: 0, rowsFailed: [],
    counts: {
      createdPersons: 0, createdRegions: 0, createdAreas: 0, createdStores: 0, createdPosts: 0,
      renamed: 0, claimed: 0, transferred: 0, reactivated: 0, deactivated: 0, noEmpNo: 0, failed: 0,
      nameConflict: 0, storeMismatch: 0
    },
    updated: { renamed: [], claimed: [], transferred: [], reactivated: [] },
    created: { persons: [], stores: [], posts: [] },
    deactivated: [], deactivatePlanned: [], noEmpNo: [], warnings: [],
    affectedPersons: 0
  };
  const note = (listName, countName, item) => {
    report.counts[countName]++;
    const arr = report.updated[listName] || report[listName];
    if (arr && arr.length < LIST_CAP) arr.push(item);
  };

  // ---------------------------------------------------------- 预取缓存
  const postRows = db.prepare('SELECT key, name FROM posts').all();
  const postByName = new Map(postRows.flatMap(p => [[p.name, p.key], [p.key, p.key]]));
  const postNameByKey = new Map(postRows.map(p => [p.key, p.name]));

  const persons = db.prepare(
    "SELECT id, name, parent_id, post_key, store_id, status, emp_no FROM org_nodes WHERE level = '人员'"
  ).all();
  const empNoIndex = new Map();      // 工号 → 人员节点
  const personByPostName = new Map(); // '岗位节点id|姓名' → 人员节点
  const personByStoreName = new Map(); // '门店id|姓名' → [人员节点]
  const byId = new Map();
  db.prepare('SELECT id, name, level, parent_id, status FROM org_nodes').all().forEach(n => byId.set(n.id, n));

  const addStoreIdx = (storeId, p) => {
    if (!storeId) return;
    const k = storeId + '|' + p.name;
    if (!personByStoreName.has(k)) personByStoreName.set(k, []);
    personByStoreName.get(k).push(p);
  };
  const delStoreIdx = (storeId, p) => {
    if (!storeId) return;
    const k = storeId + '|' + p.name;
    const list = personByStoreName.get(k);
    if (!list) return;
    const i = list.findIndex(x => x.id === p.id);
    if (i >= 0) list.splice(i, 1);
  };
  persons.forEach(p => {
    if (p.emp_no) empNoIndex.set(p.emp_no, p);
    personByPostName.set(p.parent_id + '|' + p.name, p);
    addStoreIdx(p.store_id, p);
  });

  const visited = new Set();          // 本文件出现过的节点 id（含各级）
  const scopeRegions = new Set();     // 本文件涉及的大区 id（snapshot 范围）
  const fileEmpNoName = new Map();    // 文件内 工号 → 姓名（检测一码多人）
  const affected = new Set();         // 需要重建路径的人员 id
  let rootId = null;

  // ---------------------------------------------------------- 节点保障
  function ensureNode(name, level, parentId, postKey) {
    const found = db.prepare(
      'SELECT id, status FROM org_nodes WHERE name = ? AND level = ? AND parent_id IS ?'
    ).get(name, level, parentId === null ? null : parentId);
    if (found) {
      if (found.status === 0) {                    // 重新出现 → 自动恢复
        setNodeStatus(db, found.id, 1);
        note('reactivated', 'reactivated', { nodeId: found.id, name, level });
      }
      return { id: found.id, created: false };
    }
    const id = findOrCreateNode(db, name, level, parentId, postKey);
    return { id, created: true };
  }

  // ---------------------------------------------------------- 单行处理
  function processRow(row, rowNo) {
    const region = pick(row, '大区'), area = pick(row, '小区'), store = pick(row, '门店');
    const postName = pick(row, '岗位'), personName = pick(row, '人员');
    if (!region || !area || !store || !postName || !personName) {
      throw new Error('字段不完整（大区/小区/门店/岗位/人员 均必填）');
    }
    const postKey = postByName.get(postName);
    if (!postKey) throw new Error(`未知岗位：${postName}（可用：${postRows.map(p => p.name).join(' / ')}）`);

    const empRaw = pickEmpNo(row);
    const empNo = normEmpNo(empRaw);
    if (empRaw && !empNo) throw new Error(`工号不可识别：${empRaw}`);
    if (empNo) {
      const err = empNoError(empNo);
      if (err) throw new Error(err);
      const prevName = fileEmpNoName.get(empNo);
      if (prevName && prevName !== personName) {
        throw new Error(`工号 ${empNo} 在本文件中对应多个姓名（${prevName} / ${personName}），请核对`);
      }
      fileEmpNoName.set(empNo, personName);
    }
    let effective = today;
    const effRaw = pick(row, '生效日期', '生效日', '入职日期');
    if (effRaw) {
      const d = normDate(effRaw);
      if (!d) throw new Error(`生效日期无法识别：${effRaw}`);
      effective = d;
    }
    if (!empNo) note('noEmpNo', 'noEmpNo', { row: rowNo, person: personName, store });

    // ---- 组织层级（同名节点自动恢复）
    if (rootId == null) { const r0 = ensureNode('全国', '全国', null, null); rootId = r0.id; }
    const r = ensureNode(region, '大区', rootId, null);
    if (r.created) report.counts.createdRegions++;
    visited.add(r.id); scopeRegions.add(r.id);
    const a = ensureNode(area, '小区', r.id, null);
    if (a.created) report.counts.createdAreas++;
    visited.add(a.id);
    const s = ensureNode(store, '门店', a.id, null);
    if (s.created) {
      report.counts.createdStores++;
      if (report.created.stores.length < LIST_CAP) report.created.stores.push({ row: rowNo, name: store });
    }
    visited.add(s.id);
    const pn = ensureNode(postNameByKey.get(postKey) || postName, '岗位', s.id, postKey);
    if (pn.created) {
      report.counts.createdPosts++;
      if (report.created.posts.length < LIST_CAP) report.created.posts.push({ row: rowNo, name: postNameByKey.get(postKey) || postName, store });
    }
    visited.add(pn.id);

    // ---- 定位人员：工号优先，其次认领，最后新建
    let person = empNo ? empNoIndex.get(empNo) : undefined;

    if (person && person.name !== personName) {              // 改名（跨文件才允许，同文件已在上面拦截）
      const oldName = person.name;
      personByPostName.delete(person.parent_id + '|' + oldName);
      db.prepare('UPDATE org_nodes SET name = ? WHERE id = ?').run(personName, person.id);
      addStoreIdx(person.store_id, Object.assign(person, { name: personName }));
      delStoreIdx(person.store_id, { id: person.id, name: oldName });
      personByPostName.set(person.parent_id + '|' + personName, person);
      person.name = personName;
      note('renamed', 'renamed', { row: rowNo, empNo, from: oldName, to: personName });
    }

    if (!person) {
      // ① 岗位节点 + 姓名（v3.8 口径）
      const byPost = personByPostName.get(pn.id + '|' + personName);
      if (byPost && (!empNo || !byPost.emp_no || byPost.emp_no === empNo)) {
        person = byPost;
      } else {
        // ② 门店 + 姓名（仅限尚无工号者，避免误合并已识别人员）
        const cands = (personByStoreName.get(s.id + '|' + personName) || [])
          .filter(p => !p.emp_no || p.emp_no === empNo);
        if (cands.length === 1) person = cands[0];
        else if (cands.length > 1) {
          throw new Error(`无法安全认领「${personName}」（${store} 内同名 ${cands.length} 人且无工号）——请补填工号`);
        }
      }
      if (person && empNo && !person.emp_no) {               // 认领：把工号补到已有人员上
        setPersonEmpNo(db, person.id, empNo);
        person.emp_no = empNo;
        empNoIndex.set(empNo, person);
        note('claimed', 'claimed', { row: rowNo, empNo, name: personName, store });
      }
      // 缺工号的行按姓名匹配到「已有工号」人员属高风险合并（可能是另一人），单独告警
      if (person && !empNo && person.emp_no) {
        note('warnings', 'matchedByNoEmpNo', {
          row: rowNo, name: personName, store,
          reason: `缺工号，按「岗位/门店 + 姓名」匹配到已有工号人员（${person.emp_no}）；若为另一人请补填工号以区分`
        });
      }
    }

    if (!person) {                                            // 新建人员
      const sameName = (personByStoreName.get(s.id + '|' + personName) || []);
      // 有工号 → 工号权威，强制新建（不复用同名节点，避免同门店同岗位同名不同工号被静默合并）
      // 无工号 → 沿用 v3.8 的姓名+岗位匹配（降级路径）
      const id = empNo
        ? createPersonNode(db, personName, pn.id, postKey, s.id)
        : findOrCreateNode(db, personName, '人员', pn.id, postKey);
      if (empNo) setPersonEmpNo(db, id, empNo);
      const node = { id, name: personName, parent_id: pn.id, post_key: postKey, store_id: s.id, status: 1, emp_no: empNo || null };
      byId.set(id, { id, name: personName, level: '人员', parent_id: pn.id, status: 1 });
      if (empNo) empNoIndex.set(empNo, node);
      personByPostName.set(pn.id + '|' + personName, node);
      addStoreIdx(s.id, node);
      persons.push(node);
      report.counts.createdPersons++;
      if (report.created.persons.length < LIST_CAP) {
        report.created.persons.push({ row: rowNo, name: personName, store, post: postKey, empNo: empNo || '' });
      }
      if (sameName.length) {
        note('warnings', 'nameConflict', {
          row: rowNo, name: personName, store,
          reason: `同门店已有同名人员（工号 ${sameName.map(x => x.emp_no || '空').join('、')}），` +
            (empNo ? `本次工号 ${empNo} 与既有人员不同，按不同人员新建，请核对是否为同一人` : '本次缺工号，按新人员新建，请补填工号')
        });
      }
      visited.add(id);                                        // 必须在场，否则快照会把自己新建的人判为「名单外」
      affected.add(id);
      report.rowsOk++;
      return;
    }

    // ---- 已存在：恢复在职 / 调岗 / 补段
    if (person.status === 0) {
      setNodeStatus(db, person.id, 1);
      person.status = 1;
      const n = byId.get(person.id); if (n) n.status = 1;
      note('reactivated', 'reactivated', { row: rowNo, name: personName, empNo: empNo || '' });
    }
    const cur = openAssignment(db, person.id);
    if (!cur) {                                              // 异常兜底：补一条开放段
      createAssignment(db, { personId: person.id, postKey, postNodeId: pn.id, storeId: s.id, fromDate: OPEN_FROM, source: 'import' });
      affected.add(person.id);
    } else if (cur.post_node_id !== pn.id || cur.store_id !== s.id) {
      transferPerson(db, { personId: person.id, postNodeId: pn.id, postKey, storeId: s.id, fromDate: effective, source: 'import' });
      note('transferred', 'transferred', {
        row: rowNo, name: personName, empNo: empNo || '', effective,
        from: { store: byId.get(cur.store_id) ? byId.get(cur.store_id).name : cur.store_id, post: cur.post_key },
        to: { store, post: postKey }
      });
      personByPostName.delete(cur.post_node_id + '|' + person.name);
      personByPostName.set(pn.id + '|' + person.name, person);
      delStoreIdx(cur.store_id, person);
      addStoreIdx(s.id, person);
      person.parent_id = pn.id; person.post_key = postKey; person.store_id = s.id;
      affected.add(person.id);
    }
    visited.add(person.id);                                  // 人员节点同样计入在场（快照判定依据）
    report.rowsOk++;
  }

  // ---------------------------------------------------------- snapshot：停用/恢复
  function applySnapshot() {
    // 必须读取**当前**库状态：本行导入期间可能发生调岗（父节点变化）、新建人员、自动恢复
    const fresh = db.prepare('SELECT id, name, level, parent_id, status FROM org_nodes').all();
    const now = new Map(fresh.map(n => [n.id, n]));
    const children = new Map();
    fresh.forEach(n => {
      if (n.parent_id == null) return;
      if (!children.has(n.parent_id)) children.set(n.parent_id, []);
      children.get(n.parent_id).push(n);
    });
    // 范围内全部节点（文件涉及的大区 → 其整棵子树）
    const scope = [];
    const seen = new Set();
    const stack = [...scopeRegions];
    while (stack.length) {
      const id = stack.pop();
      if (seen.has(id)) continue;
      seen.add(id);
      const n = now.get(id);
      if (!n) continue;
      scope.push(n);
      (children.get(id) || []).forEach(c => stack.push(c.id));
    }
    const activeInScope = scope.filter(n => n.status === 1).length;
    const deactivateIds = new Set(scope.filter(n => n.status === 1 && !visited.has(n.id)).map(n => n.id));
    // 岗位空置清理：范围内已无在职人员的岗位节点一并停用
    scope.filter(n => n.level === '岗位' && n.status === 1).forEach(pn => {
      const alive = (children.get(pn.id) || []).some(c => c.level === '人员' && c.status === 1 && !deactivateIds.has(c.id));
      if (!alive) deactivateIds.add(pn.id);
    });

    const list = scope.filter(n => deactivateIds.has(n.id));
    report.deactivatePlanned = list.slice(0, LIST_CAP).map(n => ({ id: n.id, name: n.name, level: n.level }));

    // 安全阀：仅针对人与门店（岗位空置清算是结果不是决策），且非 dryRun 才拦截
    const valve = list.filter(n => n.level === '人员' || n.level === '门店');
    if (!options.dryRun && !options.force && valve.length > DEACTIVATE_MIN && valve.length > activeInScope * DEACTIVATE_RATIO) {
      throw new ImportConflict(
        `本次快照将停用 ${valve.length} 个人员/门店（占范围内在职节点 ${activeInScope} 的 ${Math.round(valve.length / activeInScope * 100)}%），` +
        `疑似文件不完整。确认无误请加 force=1 重试；待停用清单见 report.deactivatePlanned`,
        report
      );
    }
    if (options.dryRun) {
      // 预检只报告、不落库；停用计数与清单按「计划停用」返回，便于确认后再执行
      list.forEach(n => note('deactivated', 'deactivated', { id: n.id, name: n.name, level: n.level }));
      return;
    }

    list.forEach(n => {
      setNodeStatus(db, n.id, 0, today);
      const node = byId.get(n.id); if (node) node.status = 0;
      note('deactivated', 'deactivated', { id: n.id, name: n.name, level: n.level });
    });
  }

  // ---------------------------------------------------------- 执行（含 dryRun 回滚）
  const tx = db.transaction(() => {
    for (const r of rows) {
      try { processRow(r.data, r.row); }
      catch (e) {
        report.counts.failed++;
        if (report.rowsFailed.length < LIST_CAP) report.rowsFailed.push({ row: r.row, reason: e.message });
      }
    }
    if (options.mode === 'snapshot') applySnapshot();
    for (const pid of affected) buildPersonPaths(db, pid);
    report.affectedPersons = affected.size;
    if (options.dryRun) throw new DryRunRollback(report);
    return report;
  });

  try { return tx(); }
  catch (e) {
    if (e instanceof DryRunRollback) return e.report;
    throw e;
  }
}

// ==================================================================== 指标

/** 指标导入：返回 {rowsOk, rowsFailed}；工号优先定位人员，回退「门店+姓名」 */
function importMetrics(db, buffer, filename) {
  const rows = parseSheet(buffer);
  const failures = [];
  let ok = 0;
  let storeMismatch = 0;

  const storeByName = new Map(db.prepare("SELECT id, name FROM org_nodes WHERE level = '门店'").all().map(s => [s.name, s]));
  // (门店id,姓名) → 人员；同时按工号建索引（工号为权威键）
  const personByStoreName = new Map();
  const personByEmpNo = new Map();
  const personRows = db.prepare(`SELECT pn.id, pn.name, pn.post_key, pn.emp_no, np.store_id
      FROM org_nodes pn
      LEFT JOIN node_paths np ON np.person_id = pn.id AND np.ancestor_id = pn.id
      WHERE pn.level = '人员'`).all();
  personRows.forEach(p => {
    if (p.emp_no) personByEmpNo.set(p.emp_no, p);
    if (p.store_id) personByStoreName.set(p.store_id + '|' + p.name, p);
  });

  const upsert = db.prepare(`
    INSERT INTO daily_metrics (person_id, date, ${METRIC_KEYS.map(k => METRIC_COLS[k]).join(', ')})
    VALUES (@personId, @date, ${METRIC_KEYS.map(k => '@' + k).join(', ')})
    ON CONFLICT (person_id, date) DO UPDATE SET ${METRIC_KEYS.map(k => METRIC_COLS[k] + ' = @' + k).join(', ')}
  `);

  const txAll = db.transaction(() => {
    for (const r of rows) {
      const row = r.data;
      try {
        const date = normDate(pick(row, '日期', 'date', 'Date'));
        if (!date) throw new Error(`日期无法识别：${pick(row, '日期', 'date', 'Date') || '(空)'}`);
        const storeName = pick(row, '门店');
        const personName = pick(row, '人员');
        if (!personName) throw new Error('人员为空');
        const empNo = normEmpNo(pickEmpNo(row));

        let person = null;
        if (empNo) {
          person = personByEmpNo.get(empNo);
          if (!person) throw new Error(`工号未匹配到人员：${empNo}——请先导入名册或核对工号`);
          const store = storeName ? storeByName.get(storeName) : null;
          if (store && person.store_id && store.id !== person.store_id) storeMismatch++;  // 调岗前后报表写旧门店名：按工号归属，仅计数
        } else {
          if (!storeName) throw new Error('门店为空（无工号时必填）');
          const store = storeByName.get(storeName);
          if (!store) throw new Error(`未知门店：${storeName}`);
          person = personByStoreName.get(store.id + '|' + personName);
          if (!person) throw new Error(`未知人员：${personName}（${storeName}）——请先导入名册或补填工号`);
          // 岗位列可选：填了则必须与人员岗位一致（门店内同名不同岗消歧）
          const postName = pick(row, '岗位');
          if (postName) {
            const post = db.prepare('SELECT key, name FROM posts WHERE name = ? OR key = ?').get(postName, postName);
            if (!post) throw new Error(`未知岗位：${postName}`);
            if (person.post_key && person.post_key !== post.key) {
              const cand = db.prepare(`SELECT pn.id FROM org_nodes pn JOIN org_nodes pst ON pn.parent_id = pst.id
                WHERE pn.level = '人员' AND pn.name = ? AND pst.parent_id = ? AND pst.post_key = ?`).get(personName, store.id, post.key);
              if (!cand) throw new Error(`${personName}（${storeName}）岗位不匹配：报表为「${post.name}」，名册为其他岗位`);
              person = { id: cand.id, name: personName, post_key: post.key, store_id: store.id };
            }
          }
        }

        const params = { personId: person.id, date };
        for (const [label, key] of Object.entries(METRIC_LABELS)) {
          const v = toNum(pick(row, label));
          if (Number.isNaN(v)) throw new Error(`「${label}」非数字：${pick(row, label)}`);
          if (v < 0) throw new Error(`「${label}」不能为负数：${v}`);
          params[key] = v;
        }
        upsert.run(params);
        ok++;
      } catch (e) {
        failures.push({ row: r.row, reason: e.message });
      }
    }
  });
  txAll();
  return { rowsOk: ok, rowsFailed: failures, storeMismatch };
}

module.exports = {
  importOrg, importMetrics, ORG_HEADERS, METRICS_HEADERS, METRIC_LABELS,
  ImportConflict, DryRunRollback
};
