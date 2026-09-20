'use strict';
/**
 * v5.2 演示数据归整 CLI：把早期 seed 的演示组织树统一挪入「虚拟区」
 *
 * 背景：库中「全国」下混着 4 个 seed 演示大区（华东/华南/华北/西南，含 8 小区 14 门店
 * 228 名虚拟人员 + 83220 行演示指标），与 12 个真实映射大区（专营店 Excel 导入）混淆。
 * 本脚本只挪节点/改名，不删任何业务数据；scope 与任职均按 node_id 引用，不受影响。
 *
 * 用法（菜单由 数据导入_新媒体.bat 驱动，也可直接命令行）：
 *   node scripts/organize-demo_v5.2.js status     查看演示树现状（只读）
 *   node scripts/organize-demo_v5.2.js apply      归整：挪入虚拟区 + 改名 + 重建 node_paths
 *   node scripts/organize-demo_v5.2.js rollback   回滚最近一次归整（恢复原名/原父节点）
 */
const dbh = require('../db');
const { rebuildAllPaths } = dbh;

const ROOT_ID = 382;                 // 全国
const VIRTUAL_NAME = '虚拟区';
const LOG_TYPE = 'demo-org';

// 归整清单：id → 新名（rename 为 null = 只挪不改名）
const MOVES = [
  { id: 383,  rename: '虚拟1区(华东大区)' },
  { id: 490,  rename: '虚拟2区(华南大区)' },
  { id: 597,  rename: '虚拟3区(华北大区)' },
  { id: 682,  rename: '虚拟4区(西南大区)' },
  { id: 1790, rename: null }         // 「未匹配」小区（含优估科技）挪入虚拟区，保持原名
];

const findVirtual = (db) => db.prepare(
  'SELECT id FROM org_nodes WHERE name = ? AND level = ? AND parent_id = ?'
).get(VIRTUAL_NAME, '大区', ROOT_ID);

function statOf(db) {
  const virtual = findVirtual(db);
  const rows = [];
  for (const m of MOVES) {
    const n = db.prepare('SELECT id, name, parent_id, level FROM org_nodes WHERE id = ?').get(m.id);
    if (!n) { rows.push({ ...m, missing: true }); continue; }
    const parent = db.prepare('SELECT name FROM org_nodes WHERE id = ?').get(n.parent_id);
    rows.push({
      ...m,
      name: n.name,
      level: n.level,
      parentName: parent ? parent.name : '(无)',
      organized: virtual ? n.parent_id === virtual.id && (!m.rename || n.name === m.rename) : false
    });
  }
  return { virtualId: virtual ? virtual.id : null, rows };
}

function showStatus(db) {
  const { virtualId, rows } = statOf(db);
  console.log('================ 演示数据归整状态 ================');
  console.log('「' + VIRTUAL_NAME + '」节点: ' + (virtualId ? '#' + virtualId : '（尚未创建）'));
  for (const r of rows) {
    if (r.missing) { console.log('  #' + r.id + ' （节点不存在）'); continue; }
    console.log('  #' + r.id + ' ' + r.name + ' [' + r.level + ']  父: ' + r.parentName +
      (r.rename ? '  → ' + r.rename : '') + (r.organized ? '  [已归整]' : ''));
  }
  const done = rows.length > 0 && rows.every(r => r.organized);
  console.log(done ? '\n结论: 已归整（可 rollback 恢复）' : '\n结论: 未归整（可 apply 执行）');
}

function countDesc(db, id) {
  return db.prepare(
    'WITH RECURSIVE t(x) AS (SELECT ? UNION ALL SELECT o.id FROM org_nodes o JOIN t ON o.parent_id = t.x) SELECT COUNT(*) c FROM t'
  ).get(id).c;
}

function apply(db) {
  const { virtualId, rows } = statOf(db);
  if (rows.length && rows.every(r => r.organized)) {
    console.log('已经是归整后的状态，无需重复执行（如需恢复请用 rollback）');
    return;
  }
  if (rows.some(r => r.missing)) throw new Error('目标节点缺失: ' + rows.filter(r => r.missing).map(r => '#' + r.id).join(', '));

  // 记录挪动前的原状（回滚凭据）
  const originals = rows.map(r => ({ id: r.id, name: r.name, parentId: db.prepare('SELECT parent_id FROM org_nodes WHERE id = ?').get(r.id).parent_id }));

  const upd = db.prepare('UPDATE org_nodes SET parent_id = ?, name = ? WHERE id = ?');
  let virtualCreated = false;
  const tx = db.transaction(() => {
    let vid = virtualId;
    if (!vid) {
      const ins = db.prepare('INSERT INTO org_nodes (name, level, parent_id, post_key, status) VALUES (?, ?, ?, NULL, 1)');
      vid = ins.run(VIRTUAL_NAME, '大区', ROOT_ID).lastInsertRowid;
      virtualCreated = true;
    }
    for (const r of rows) {
      const newName = r.rename || r.name;
      upd.run(vid, newName, r.id);
      console.log('  挪动: #' + r.id + ' ' + r.name + ' → ' + VIRTUAL_NAME + (r.rename ? ' 并改名「' + r.rename + '」' : ''));
    }
    const r = rebuildAllPaths(db);
    console.log('  node_paths 已重建: 人员 ' + r.persons + ' / 路径 ' + r.paths + ' 行');
  });
  tx();

  const report = {
    action: 'organize-demo',
    virtualNodeId: findVirtual(db).id,
    virtualCreated,
    originals,
    descendants: originals.map(o => ({ id: o.id, count: countDesc(db, o.id) }))
  };
  db.prepare('INSERT INTO import_logs (type, filename, rows_ok, rows_failed, report_json) VALUES (?,?,?,?,?)')
    .run(LOG_TYPE, 'organize-demo_v5.2.js', originals.length, 0, JSON.stringify(report));
  console.log('================ 归整完成 ================');
  console.log('共挪动 ' + originals.length + ' 个节点，明细业务数据（人员/指标/评分）全部保留；import_logs 已留痕（type=' + LOG_TYPE + '）');
}

function rollback(db) {
  const log = db.prepare(
    "SELECT * FROM import_logs WHERE type = ? AND report_json NOT LIKE '%\"rolledBackAt\"%' ORDER BY id DESC LIMIT 1"
  ).get(LOG_TYPE);
  if (!log) throw new Error('没有可回滚的归整批次');
  const rp = JSON.parse(log.report_json || '{}');
  console.log('即将回滚归整批次 #' + log.id + '：恢复 ' + (rp.originals || []).length + ' 个节点的原名/原父节点');
  const upd = db.prepare('UPDATE org_nodes SET parent_id = ?, name = ? WHERE id = ?');
  const tx = db.transaction(() => {
    for (const o of rp.originals || []) {
      upd.run(o.parentId, o.name, o.id);
      console.log('  恢复: #' + o.id + ' ' + o.name);
    }
    // 本次新建的虚拟区节点：子节点已全部挪回后删除
    if (rp.virtualCreated && rp.virtualNodeId) {
      const left = db.prepare('SELECT COUNT(*) c FROM org_nodes WHERE parent_id = ?').get(rp.virtualNodeId).c;
      if (left === 0) {
        db.prepare('DELETE FROM org_nodes WHERE id = ?').run(rp.virtualNodeId);
        console.log('  删除本次新建的「' + VIRTUAL_NAME + '」节点 #' + rp.virtualNodeId);
      } else {
        console.log('  「' + VIRTUAL_NAME + '」下仍有 ' + left + ' 个子节点，保留不删');
      }
    }
    const r = rebuildAllPaths(db);
    console.log('  node_paths 已重建: 人员 ' + r.persons + ' / 路径 ' + r.paths + ' 行');
    rp.rolledBackAt = new Date().toISOString().slice(0, 19).replace('T', ' ');
    db.prepare('UPDATE import_logs SET report_json = ? WHERE id = ?').run(JSON.stringify(rp), log.id);
  });
  tx();
  console.log('回滚完成：演示树已恢复原状（日志保留并标记已回滚）');
}

// ------------------------------------------------------------ 入口
try {
  const mode = process.argv[2] || 'status';
  const db = dbh.openDb();
  if (mode === 'status') showStatus(db);
  else if (mode === 'apply') apply(db);
  else if (mode === 'rollback') rollback(db);
  else if (mode === 'menu') {
    console.log('v5.2 演示数据归整——请用 bat 菜单或直接传参：status / apply / rollback');
    showStatus(db);
  } else throw new Error('未知模式: ' + mode);
  db.close();
} catch (e) {
  console.error('[错误] ' + (e && e.message ? e.message : e));
  process.exit(1);
}
