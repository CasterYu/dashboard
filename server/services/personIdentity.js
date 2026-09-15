'use strict';
/**
 * 人员身份识别（v4）：以「工号」作为唯一标识
 * - 工号按字符串处理，**保留前导零**（'007' 不等于 7）
 * - 归一化：全角转半角、去全部空白与零宽字符、字母大写
 * - 不涉及身份证等敏感信息：上游文件若含身份证列，导入时整列忽略
 */

/** 归一化工号：全角→半角，去空白/零宽字符，字母大写；缺省返回 '' */
function normEmpNo(raw) {
  if (raw === undefined || raw === null) return '';
  let s = String(raw);
  s = s.replace(/[\uFF01-\uFF5E]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));
  s = s.replace(/[\u3000\s\u200B-\u200D\uFEFF]/g, '');
  return s.toUpperCase();
}

/** 校验归一化后的工号；返回失败原因（null = 合法） */
function empNoError(norm) {
  if (!norm) return '工号为必填（若确实拿不到，请留空并确认可接受按姓名匹配的风险）';
  if (norm.length > 32) return `工号过长（${norm.length} 字符，上限 32）`;
  if (!/^[A-Z0-9][A-Z0-9._-]*$/.test(norm)) return `工号含非法字符：${norm}`;
  return null;
}

/** 是否形如工号的列名（用于模板兼容与忽略身份证列的判断） */
const EMP_NO_HEADERS = ['工号', '员工编号', '员工号', '员工工号', 'empno', 'employee_no', 'employeeno'];

/** 需要被整体忽略的敏感列（不落库、不回显、不进报告） */
const IGNORED_HEADERS = ['身份证', '身份证号', '身份证号码', '证件号', 'idcard', 'id_card'];

module.exports = { normEmpNo, empNoError, EMP_NO_HEADERS, IGNORED_HEADERS };
