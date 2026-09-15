'use strict';
/**
 * 人员数据质量（v4）：工号覆盖率与重复检测
 * 仅涉及姓名 / 门店 / 工号，不含身份证等敏感信息
 */

/** 汇总计数（供 /api/org 附带与启动日志使用，开销极小） */
function dataQualityCounts(db) {
  const persons = db.prepare("SELECT id, status, emp_no FROM org_nodes WHERE level = '人员'").all();
  const active = persons.filter(p => p.status === 1);
  const dup = new Map();
  persons.forEach(p => { if (p.emp_no) dup.set(p.emp_no, (dup.get(p.emp_no) || 0) + 1); });
  return {
    personsTotal: persons.length,
    personsActive: active.length,
    personsInactive: persons.length - active.length,
    activeWithEmpNo: active.filter(p => p.emp_no).length,
    activeMissingEmpNo: active.filter(p => !p.emp_no).length,
    duplicateEmpNo: Array.from(dup.values()).filter(c => c > 1).length,
    nodesInactive: db.prepare('SELECT COUNT(*) AS c FROM org_nodes WHERE status = 0').get().c,
    storesActive: db.prepare("SELECT COUNT(*) AS c FROM org_nodes WHERE level = '门店' AND status = 1").get().c
  };
}

/** 明细清单：在职缺工号人员（最多 limit 条）与重复工号组 */
function dataQualityReport(db, limit) {
  const n = Math.max(1, Math.min(Number(limit) || 100, 500));
  const missingEmpNo = db.prepare(`
    SELECT p.id, p.name, p.post_key, st.name AS store_name
    FROM org_nodes p
    LEFT JOIN org_nodes st ON st.id = p.store_id
    WHERE p.level = '人员' AND p.status = 1 AND (p.emp_no IS NULL OR p.emp_no = '')
    ORDER BY st.name, p.name
    LIMIT ?
  `).all(n);
  const duplicateEmpNo = db.prepare(`
    SELECT emp_no, COUNT(*) AS cnt, GROUP_CONCAT(id) AS ids
    FROM org_nodes
    WHERE level = '人员' AND emp_no IS NOT NULL AND emp_no <> ''
    GROUP BY emp_no HAVING COUNT(*) > 1
    LIMIT ?
  `).all(n);
  return {
    missingEmpNo: missingEmpNo.map(r => ({ id: r.id, name: r.name, storeName: r.store_name, postKey: r.post_key })),
    duplicateEmpNo: duplicateEmpNo.map(r => ({ empNo: r.emp_no, count: r.cnt, personIds: String(r.ids).split(',').map(Number) }))
  };
}

module.exports = { dataQualityCounts, dataQualityReport };
