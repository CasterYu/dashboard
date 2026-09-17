# -*- coding: utf-8 -*-
"""
灯塔积分数据生成器（v4.6）

输入（三张 Excel）：
  1. 灯塔系统需求0910.xlsx        —— 9 个「岗位-日积分规则」sheet（规则主数据）+ 积分规则需求调研（A/B/C 类）
  2. scoring_result_交付专员.xlsx  —— 评分明细 + 个人得分汇总
  3. scoring_result_交付店长.xlsx  —— 评分明细 + 个人得分汇总

输出：
  lighthouse_scoring_v4.6.js      —— 前端静态数据模块（window.LH_SCORING）

设计要点：
  · 门店 → 城市 → 省份 → 大区（7 个）/ 小区（20 个）的映射表内置在本脚本，便于人工修订
  · 明细/汇总采用「字典 + 索引行」的紧凑结构，避免逐行对象膨胀
  · AI 证据文本解析为 verdict + key/value 证据对（上传路径折叠为「共 N 张」）
  · 销量为确定性生成（种子 = 工号/门店编码 + 岗位），与个人积分正相关，刷新不漂移
"""
import glob
import json
import os
import re
import sys
from collections import Counter, OrderedDict, defaultdict

import openpyxl

VERSION = 'v4.6'
BASE = os.path.expandvars(r'C:\Users\Administrator\AppData\Local\Temp\codebuddy-dropped-files')
OUT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# ==================== 门店 → 城市 → 省份 → 大区 / 小区 ====================
CITY_PROVINCE = {
    '三亚': '海南', '三门峡': '河南', '上海': '上海', '上饶': '江西', '东莞': '广东', '东营': '山东',
    '中山': '广东', '临夏': '甘肃', '临汾': '山西', '临沂': '山东', '义乌': '浙江', '乌兰察布': '内蒙古',
    '乌鲁木齐': '新疆', '九江': '江西', '云浮': '广东', '仙桃': '湖北', '伊犁': '新疆', '佛山': '广东',
    '佳木斯': '黑龙江', '保定': '河北', '保山': '云南', '信阳': '河南', '儋州': '海南', '克拉玛依': '新疆',
    '六盘水': '贵州', '兴义': '贵州', '兴安盟': '内蒙古', '包头': '内蒙古', '北京': '北京', '北海': '广西',
    '十堰': '湖北', '南京': '江苏', '南充': '四川', '南宁': '广西', '南昌': '江西', '南通': '江苏',
    '南阳': '河南', '厦门': '福建', '双鸭山': '黑龙江', '台州': '浙江', '合肥': '安徽', '吉安': '江西',
    '吉林': '吉林', '吉首': '湖南', '吐鲁番': '新疆', '吴江': '江苏', '周口': '河南', '呼伦贝尔': '内蒙古',
    '呼和浩特': '内蒙古', '咸阳': '陕西', '哈密': '新疆', '哈尔滨': '黑龙江', '唐山': '河北', '商丘': '河南',
    '喀什': '新疆', '嘉兴': '浙江', '固原': '宁夏', '大理': '云南', '大连': '辽宁', '天津': '天津',
    '太仓': '江苏', '太原': '山西', '奎屯': '新疆', '威海': '山东', '娄底': '湖南', '孝感': '湖北',
    '宁乡': '湖南', '宁德': '福建', '宁波': '浙江', '安庆': '安徽', '安阳': '河南', '安顺': '贵州',
    '宜宾': '四川', '宜昌': '湖北', '宜春': '江西', '宝鸡': '陕西', '宣城': '安徽', '宿州': '安徽',
    '宿迁': '江苏', '岳阳': '湖南', '巴中': '四川', '常州': '江苏', '常德': '湖南', '平凉': '甘肃',
    '平顶山': '河南', '广州': '广东', '庆阳': '甘肃', '库尔勒': '新疆', '廊坊': '河北', '延吉': '吉林',
    '开封': '河南', '张家口': '河北', '张家界': '湖南', '徐州': '江苏', '德州': '山东', '德阳': '四川',
    '忻州': '山西', '恩施': '湖北', '惠州': '广东', '慈溪': '浙江', '成都': '四川', '扬州': '江苏',
    '承德': '河北', '抚州': '江西', '抚顺': '辽宁', '文山': '云南', '新乡': '河南', '无锡': '江苏',
    '昆山': '江苏', '昆明': '云南', '晋中': '山西', '晋城': '山西', '曲阜': '山东', '朔州': '山西',
    '杭州': '浙江', '枣庄': '山东', '柳州': '广西', '株洲': '湖南', '梅州': '广东', '梧州': '广西',
    '武冈': '湖南', '武威': '甘肃', '武汉': '湖北', '毕节': '贵州', '汕头': '广东', '汕尾': '广东',
    '江门': '广东', '江阴': '江苏', '沈阳': '辽宁', '沧州': '河北', '河源': '广东', '泉州': '福建',
    '泰安': '山东', '泰州': '江苏', '洛阳': '河南', '济南': '山东', '济宁': '山东', '济源': '河南',
    '浏阳': '湖南', '海口': '海南', '涪陵': '重庆', '淄博': '山东', '深圳': '广东', '清远': '广东',
    '温州': '浙江', '湖州': '浙江', '湘潭': '湖南', '湛江': '广东', '溧阳': '江苏', '滨州': '山东',
    '漳州': '福建', '潍坊': '山东', '濮阳': '河南', '烟台': '山东', '版纳': '云南', '玉溪': '云南',
    '珠海': '广东', '益阳': '湖南', '盐城': '江苏', '眉山': '四川', '石家庄': '河北', '石河子': '新疆',
    '福州': '福建', '秦皇岛': '河北', '绥化': '黑龙江', '绵阳': '四川', '聊城': '山东', '肇庆': '广东',
    '芜湖': '安徽', '苏州': '江苏', '茂名': '广东', '荆州': '湖北', '荆门': '湖北', '荣成': '山东',
    '莆田': '福建', '莱芜': '山东', '菏泽': '山东', '葫芦岛': '辽宁', '衡水': '河北', '衢州': '浙江',
    '襄阳': '湖北', '西宁': '青海', '西安': '陕西', '贵阳': '贵州', '赣州': '江西', '达州': '四川',
    '运城': '山西', '连云港': '江苏', '通辽': '内蒙古', '遂宁': '四川', '遵义': '贵州', '邢台': '河北',
    '邯郸': '河北', '邵阳': '湖南', '郑州': '河南', '郴州': '湖南', '鄂尔多斯': '内蒙古', '鄂州': '湖北',
    '酒泉': '甘肃', '重庆': '重庆', '金华': '浙江', '金昌': '甘肃', '银川': '宁夏', '锡林浩特': '内蒙古',
    '镇江': '江苏', '长春': '吉林', '长沙': '湖南', '阳江': '广东', '阳泉': '山西', '阿克苏': '新疆',
    '阿勒泰': '新疆', '随州': '湖北', '雅安': '四川', '青岛': '山东', '鞍山': '辽宁', '韶关': '广东',
    '顺德': '广东', '鸡西': '黑龙江', '黄冈': '湖北', '龙岩': '福建',
    # 补充常见城市（便于后续新增门店直接命中）
    '佛山': '广东', '惠州': '广东', '宁波': '浙江', '温州': '浙江', '无锡': '江苏', '常州': '江苏',
    '南昌': '江西', '郑州': '河南', '洛阳': '河南', '太原': '山西', '石家庄': '河北', '沈阳': '辽宁',
    '长春': '吉林', '哈尔滨': '黑龙江', '西安': '陕西', '兰州': '甘肃', '西宁': '青海', '银川': '宁夏',
    '乌鲁木齐': '新疆', '昆明': '云南', '贵阳': '贵州', '南宁': '广西', '海口': '海南', '福州': '福建',
}
PROVINCE_REGION = {
    '上海': '华东大区', '江苏': '华东大区', '浙江': '华东大区', '安徽': '华东大区',
    '福建': '华东大区', '江西': '华东大区', '山东': '华东大区',
    '广东': '华南大区', '广西': '华南大区', '海南': '华南大区',
    '湖北': '华中大区', '湖南': '华中大区', '河南': '华中大区',
    '北京': '华北大区', '天津': '华北大区', '河北': '华北大区', '山西': '华北大区', '内蒙古': '华北大区',
    '辽宁': '东北大区', '吉林': '东北大区', '黑龙江': '东北大区',
    '陕西': '西北大区', '甘肃': '西北大区', '青海': '西北大区', '宁夏': '西北大区', '新疆': '西北大区',
    '重庆': '西南大区', '四川': '西南大区', '贵州': '西南大区', '云南': '西南大区',
}
AREA_OF_PROVINCE = {
    '上海': '沪苏小区', '江苏': '沪苏小区',
    '浙江': '浙皖小区', '安徽': '浙皖小区',
    '福建': '闽赣小区', '江西': '闽赣小区',
    '山东': '山东小区',
    '广东': '广东小区', '广西': '广西小区', '海南': '海南小区',
    '湖北': '湖北小区', '湖南': '湖南小区', '河南': '河南小区',
    '北京': '京津冀小区', '天津': '京津冀小区', '河北': '京津冀小区',
    '山西': '晋蒙小区', '内蒙古': '晋蒙小区',
    '辽宁': '辽宁小区', '吉林': '黑吉小区', '黑龙江': '黑吉小区',
    '陕西': '陕甘宁小区', '甘肃': '陕甘宁小区', '宁夏': '陕甘宁小区',
    '新疆': '新疆小区', '青海': '青海小区',
    '重庆': '川渝小区', '四川': '川渝小区', '贵州': '贵州小区', '云南': '云南小区',
}
REGION_ORDER = ['华东大区', '华南大区', '华中大区', '华北大区', '东北大区', '西北大区', '西南大区', '其他']
AREA_ORDER = list(OrderedDict.fromkeys(AREA_OF_PROVINCE.values())) + ['其他']

# 岗位 sheet → 前端 postKey（对应 index.html 的 POSTS）
RULE_SHEETS = [
    ('产品专家-日积分规则', 'productExpert'),
    ('交付店长-日积分规则', 'deliveryManager'),
    ('交付专员-日积分规则', 'deliverySpecialist'),
    ('销售店长-日积分规则', 'salesManager'),
    ('数营专家-日积分规则', 'dataExpert'),
    ('直播专员-日积分规则', 'liveStreamer'),
    ('新媒体运营-日积分规则', 'newMedia'),
    ('市场经理-日积分规则', 'marketManager'),
    ('客户管家及客户经理-日积分规则', 'customerManager'),
]
POST_NAME = {
    'productExpert': '产品专家', 'deliveryManager': '交付店长', 'deliverySpecialist': '交付专员',
    'salesManager': '销售店长', 'dataExpert': '数营专家', 'liveStreamer': '直播专员',
    'newMedia': '新媒体运营', 'marketManager': '市场经理', 'customerManager': '客户管家/经理',
    'salesSpecialist': '销售专员',
}
SCORING_FILES = [('交付专员', 'deliverySpecialist'), ('交付店长', 'deliveryManager')]

# 表头标签 → 规范字段
HDR_MAP = {
    '每日拿分项': 'name', '项目': 'name',
    '今日目标': 'target', '目标': 'target', '实际达成': 'target', '达成': 'target',
    '扣分数量': 'dedCount',
    '单次分值': 'per', '基准分': 'per', '标准分': 'per',
    '日常封顶': 'cap', '日标准得分': 'cap', '得分': 'cap',
    '周末/节假日/活动封顶': 'capWeekend', '末/节/活封顶': 'capWeekend', '日封顶得分': 'capWeekend',
    '拿分必须做到': 'mustDo', '拿分要求': 'mustDo',
    '判断逻辑': 'judge', '不计分情况': 'noScore',
    '看哪里': 'where', '证据要求': 'evidence',
    '动作得分': 'actScore',
}
PER_RE = re.compile(r'扣\s*([\d.]+)\s*分')
NUM_RE = re.compile(r'^-?\d+(\.\d+)?$')
EVID_RE = re.compile(r'^(已满足|未满足)【(.+?)】证据：(.*)$', re.S)
TS_RE = re.compile(r'(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::\d{2})?(?:\.\d+)?')
REQ_DAY_RE = re.compile(r'日常\s*[≥>=]\s*([\d.]+)\s*分')
REQ_STD_RE = re.compile(r'标准得分\s*[=≥>=]\s*([\d.]+)\s*分')


def clean(v):
    if v is None:
        return ''
    s = str(v).replace('\r\n', '\n').replace('\r', '\n').strip()
    return re.sub(r'\n{3,}', '\n\n', s)


def to_num(s):
    s = clean(s)
    if not s or s == '-':
        return None
    if NUM_RE.match(s):
        f = float(s)
        return int(f) if f == int(f) else f
    if len(s) <= 12:                      # 「3分」这类短文本取其中数字
        m = re.search(r'[\d.]+', s)
        if m:
            f = float(m.group(0))
            return int(f) if f == int(f) else f
    return None


def compact_ts(s):
    """证据里的完整时间戳压缩为「MM-DD HH:MM」，便于前端时间线展示"""
    return TS_RE.sub(lambda m: '%s-%s %s:%s' % (m.group(2), m.group(3), m.group(4), m.group(5)), s)


def parse_per(text):
    """单次分值文本 → 数值（如「逾期或未执行每单扣0.5分」→ 0.5）"""
    s = clean(text)
    if not s or s == '-':
        return None
    m = PER_RE.search(s)
    if m:
        f = float(m.group(1))
        return int(f) if f == int(f) else f
    n = to_num(s)
    if n is not None:
        return n
    m = re.search(r'([\d.]+)\s*分', s)
    if m:
        f = float(m.group(1))
        return int(f) if f == int(f) else f
    return None


# ==================== 一、规则主数据 ====================
def parse_rules(req_path):
    wb = openpyxl.load_workbook(req_path, data_only=True)
    rules = OrderedDict()
    for sheet, post_key in RULE_SHEETS:
        if sheet not in wb.sheetnames:
            report_warn('缺少规则 sheet：%s' % sheet)
            continue
        ws = wb[sheet]
        max_col = ws.max_column
        # 表头行：A 列为「每日拿分项」或「项目」
        hdr_row = None
        for r in range(1, min(ws.max_row, 30) + 1):
            if clean(ws.cell(r, 1).value) in ('每日拿分项', '项目'):
                hdr_row = r
                break
        # 第一步基础工作：定位「第一步」与「说明」之间的行
        basis = []
        step_row = note_row = None
        for r in range(4, (hdr_row or 16)):
            a = clean(ws.cell(r, 1).value)
            if a.startswith('第一步'):
                step_row = r
            elif a.startswith('说明') and step_row:
                note_row = r
                break
        if step_row:
            end = note_row or (hdr_row or step_row + 6)
            for r in range(step_row + 1, end):
                phase = clean(ws.cell(r, 1).value)
                task = clean(ws.cell(r, 2).value)
                if not phase and not task:
                    continue
                ev = ''
                for c in range(max_col, 2, -1):
                    if clean(ws.cell(r, c).value):
                        ev = clean(ws.cell(r, c).value)
                        break
                basis.append([phase, task.replace('\n', ' '), ev])
        items = []
        cols = []
        if hdr_row:
            hdr = {}
            for c in range(1, max_col + 1):
                label = clean(ws.cell(hdr_row, c).value)
                if label:
                    cols.append(label)
                    hdr[c] = HDR_MAP.get(label, 'extra:' + label)
            r = hdr_row + 1
            while r <= ws.max_row:
                a = clean(ws.cell(r, 1).value)
                if not a or a.startswith('关键动作得分合计'):
                    break
                row = {'seq': len(items) + 1, 'extra': []}
                for c, key in hdr.items():
                    if c == 1:
                        continue
                    val = clean(ws.cell(r, c).value)
                    if not val:
                        continue
                    if key.startswith('extra:'):
                        row['extra'].append([key[6:], val])
                    else:
                        row[key] = val
                row['name'] = re.sub(r'\s+', '', a)
                row['per'] = parse_per(row.get('per', ''))
                row['cap'] = to_num(row.get('cap', ''))
                row['capWeekend'] = to_num(row.get('capWeekend', ''))
                # 部分岗位（销售店长/数营专家）无「日常封顶」列，用单次分值兜底；再兜底为 1
                if not isinstance(row['cap'], (int, float)):
                    row['cap'] = row['per'] if isinstance(row['per'], (int, float)) and row['per'] >= 1 else 1
                blob = ' '.join([str(v) for v in row.values() if isinstance(v, str)]) \
                    + ' ' + ' '.join(str(x[1]) for x in row['extra'])
                if '取消' in blob or '作废' in blob:
                    row['deprecated'] = 1
                items.append(row)
                r += 1
        # 满分：优先「总分要求」文本声明的日常标准分，其次规则表合计行，最后按拿分项封顶求和
        item_sum = sum([i['cap'] for i in items if isinstance(i.get('cap'), (int, float))])
        declared = None
        for r in range(1, ws.max_row + 1):
            a = clean(ws.cell(r, 1).value)
            if '当日积分合计' in a or '关键动作得分合计' in a:
                for c in range(2, max_col + 1):
                    n = to_num(ws.cell(r, c).value)
                    if n is not None and n > 0:
                        declared = n if declared is None else declared
                        break
        req_text = ''
        for r in range(1, ws.max_row + 1):
            for c in range(1, max_col + 1):
                v = clean(ws.cell(r, c).value)
                if ('总分要求' in v or '标准得分' in v) and not req_text:
                    req_text = v
        cap = None
        m = REQ_DAY_RE.search(req_text) or REQ_STD_RE.search(req_text)
        if m:
            f = float(m.group(1))
            cap = int(f) if f == int(f) else f
        if cap is None and declared:
            cap = declared
        if cap is None and item_sum > 0:
            cap = item_sum
        if cap is None:
            cap = 1
        # 草案标记：规则表公式未定稿（含 #REF!）或全部拿分项均已取消
        draft = 0
        for r in range(1, ws.max_row + 1):
            for c in range(1, max_col + 1):
                v = ws.cell(r, c).value
                if isinstance(v, str) and '#REF' in v:
                    draft = 1
                    break
            if draft:
                break
        if items and all(it.get('deprecated') for it in items):
            draft = 1
        rules[post_key] = {
            'draft': draft,
            'postKey': post_key, 'postName': POST_NAME[post_key], 'sheet': sheet,
            'cols': cols,
            'basis': basis,
            'items': items,
            'cap': cap,                  # 当日满分（日常）
            'capSum': item_sum,          # 按拿分项封顶求和
            'capDeclared': declared,     # 规则表合计行声明值
            'requireText': req_text,
            'collected': [],
        }
    # 积分规则需求调研：A/B/C 类考核项（月积分、扣分项），作为规则视图的补充
    monthly = []
    if '积分规则需求调研' in wb.sheetnames:
        ws = wb['积分规则需求调研']
        for r in range(3, ws.max_row + 1):
            kind = clean(ws.cell(r, 3).value)       # C 列：类型（日积分/月积分）
            post = clean(ws.cell(r, 4).value)       # D 列：业务岗位
            cls = clean(ws.cell(r, 5).value)        # E 列：积分类型（A类/B类/C类）
            item = clean(ws.cell(r, 6).value)       # F 列：考核指标项
            if not (post and item):
                continue
            monthly.append({
                'post': post, 'kind': kind, 'cls': cls, 'item': item,
                'rule': clean(ws.cell(r, 7).value),
                'category': clean(ws.cell(r, 8).value),
                'dataSource': clean(ws.cell(r, 10).value),
            })
    return rules, monthly


# ==================== 二、真实评分数据 ====================
def parse_scoring(rules):
    """返回 details / sums / stores / persons 原始结构"""
    stores = OrderedDict()   # dlr_name → code
    persons = OrderedDict()  # (code|post) → {code,name,post,store}
    details = []
    sums = []
    per_post_items = defaultdict(set)
    for label, post_key in SCORING_FILES:
        path = glob.glob(os.path.join(BASE, '*', 'scoring_result_%s.xlsx' % label))
        if not path:
            report_warn('缺少评分文件：scoring_result_%s.xlsx' % label)
            continue
        wb = openpyxl.load_workbook(path[0], data_only=True)
        ws_d = wb[wb.sheetnames[0]]
        ws_s = wb[wb.sheetnames[1]]
        for r in ws_d.iter_rows(min_row=3, values_only=True):
            if r[0] is None:
                continue
            name = clean(r[0]); code = clean(r[1]); emp = clean(r[4])
            if not (name and emp):
                continue
            stores.setdefault(name, code)
            persons.setdefault(emp + '|' + post_key, {'code': emp, 'name': clean(r[3]), 'post': post_key, 'store': name})
            item = clean(r[6]); action = clean(r[7])
            per_post_items[post_key].add(item)
            details.append({
                'store': name, 'storeCode': code, 'post': post_key, 'emp': emp,
                'date': clean(r[5])[:10], 'item': item, 'action': action,
                'score': float(r[8]) if r[8] is not None else 0.0,
                'evidence': clean(r[9]), 'order': clean(r[11]),
            })
        for r in ws_s.iter_rows(min_row=3, values_only=True):
            if r[0] is None:
                continue
            emp = clean(r[4])
            if not emp:
                continue
            sums.append({
                'store': clean(r[0]), 'storeCode': clean(r[1]), 'post': post_key, 'emp': emp,
                'date': clean(r[5])[:10], 'item': clean(r[6]), 'target': clean(r[7]),
                'count': to_num(r[8]), 'targetScore': to_num(r[9]), 'score': to_num(r[10]),
            })
    return stores, persons, details, sums, per_post_items


# ==================== 三、组织映射 ====================
def map_store_city(name):
    keys = sorted(CITY_PROVINCE.keys(), key=len, reverse=True)
    for k in keys:
        if name.startswith(k):
            return k
    for k in keys:
        if k in name:
            return k
    return ''


def build_org(stores):
    """门店名 → 城市/省份/大区/小区"""
    out = []
    unmatched = []
    for name, code in stores.items():
        city = map_store_city(name)
        prov = CITY_PROVINCE.get(city, '')
        region = PROVINCE_REGION.get(prov, '其他')
        area = AREA_OF_PROVINCE.get(prov, '其他')
        if not city:
            unmatched.append(name)
        out.append({'code': code, 'name': name, 'city': city or '其他',
                    'province': prov or '其他', 'region': region, 'area': area})
    out.sort(key=lambda s: (REGION_ORDER.index(s['region']) if s['region'] in REGION_ORDER else 99,
                            AREA_ORDER.index(s['area']) if s['area'] in AREA_ORDER else 99,
                            s['name']))
    return out, unmatched


# ==================== 四、证据解析 ====================
def parse_evidence(text):
    """'已满足【动作】证据：k=v，k=v，判定=x' → [ok(0/1), 'k=v|k=v|…']（紧凑串，前端按 | 与 = 还原）
    上传凭证路径（通常一长串 /pfupload/...）折叠为单条「上传凭证=共N张」。"""
    m = EVID_RE.match(text)
    if not m:
        return [0, '']
    ok = 1 if m.group(1) == '已满足' else 0
    segs = []
    uploads = 0
    for seg in re.split(r'[，,]', m.group(3)):
        seg = seg.strip().rstrip('。')
        if not seg:
            continue
        if '=' in seg:
            k, v = seg.split('=', 1)
            k = k.strip(); v = compact_ts(v.strip())
            if '路径' in k or 'pfupload' in v:
                uploads += v.count(',') + 1
                continue
            if len(v) > 80:
                v = v[:80] + '…'
            segs.append(k + '=' + v)
        elif 'pfupload' in seg or seg.startswith('/'):
            uploads += 1
        else:
            segs.append('说明=' + compact_ts(seg)[:80])
    if uploads:
        segs.append('上传凭证=共%d张' % uploads)
    return [ok, '|'.join(segs)]


# ==================== 五、销量（确定性生成） ====================
def fnv(s):
    h = 2166136261
    for ch in s:
        h ^= ord(ch)
        h = (h * 16777619) & 0xFFFFFFFF
    return h


def gen_sales(store_code, emp_code, post_key, ratio):
    """销量：个人动作达成率(0~1) + 个人稳定偏好 + 门店稳定偏好，三者加权，确定性可复现"""
    r_p = (fnv(emp_code + '|sales|' + VERSION) % 10000) / 10000.0
    r_s = (fnv(store_code + '|storesales|' + VERSION) % 10000) / 10000.0
    if post_key == 'deliverySpecialist':
        span = 6.0     # 交付专员：个人当日交付台数
    elif post_key == 'deliveryManager':
        span = 26.0    # 交付店长：门店当日交付量
    else:
        span = 12.0
    v = span * (0.45 * ratio + 0.35 * r_p + 0.20 * r_s)
    return int(round(v))


# ==================== 主流程 ====================
WARNINGS = []


def report_warn(msg):
    WARNINGS.append(msg)


def main():
    req = glob.glob(os.path.join(BASE, '*', '灯塔系统需求0910.xlsx'))
    if not req:
        print('ERROR: 未找到 灯塔系统需求0910.xlsx')
        return 1
    rules, monthly = parse_rules(req[0])
    stores_raw, persons_raw, details, sums, per_post_items = parse_scoring(rules)

    # 规则 ↔ 真实数据：标注「已接入采集」的拿分项，并计算已接入项的可得分上限
    for post_key, st in per_post_items.items():
        if post_key in rules:
            rules[post_key]['collected'] = sorted(st)
    for post_key, st in rules.items():
        coll = set(st['collected'])
        st['capCollected'] = sum(
            it['cap'] for it in st['items']
            if it['name'] in coll and isinstance(it.get('cap'), (int, float)))
        st['capAvailable'] = st['capCollected'] if st['capCollected'] > 0 else st['cap']

    store_list, unmatched = build_org(stores_raw)
    store_idx = {s['name']: i for i, s in enumerate(store_list)}
    person_list = list(persons_raw.values())
    person_list.sort(key=lambda p: (store_idx.get(p['store'], 0), p['post'], p['code']))
    person_idx = {(p['code'], p['post']): i for i, p in enumerate(person_list)}

    # 明细：字典 + 索引行
    d_items = sorted({d['item'] for d in details})
    d_actions = sorted({d['action'] for d in details})
    d_orders = sorted({d['order'] for d in details if d['order']})
    d_dates = sorted({d['date'] for d in details})
    item_i = {v: i for i, v in enumerate(d_items)}
    act_i = {v: i for i, v in enumerate(d_actions)}
    ord_i = {v: i for i, v in enumerate(d_orders)}
    date_i = {v: i for i, v in enumerate(d_dates)}
    d_rows = []
    for d in details:
        ok, ev = parse_evidence(d['evidence'])
        d_rows.append([
            person_idx[(d['emp'], d['post'])], date_i[d['date']],
            item_i[d['item']], act_i[d['action']], d['score'], ok,
            ev, ord_i.get(d['order'], -1),
        ])

    # 汇总
    s_rows = []
    for s in sums:
        if (s['emp'], s['post']) not in person_idx:
            continue
        s_rows.append([
            person_idx[(s['emp'], s['post'])], date_i.get(s['date'], 0), item_i.get(s['item'], -1),
            s['target'], s['count'], s['targetScore'], s['score'],
        ])

    # 自洽性校验：由明细推导的拿分项得分 vs 汇总个人得分
    derived = defaultdict(float)
    for d in details:
        derived[(d['emp'], d['post'], d['item'])] += d['score']
    mismatch = 0
    checked = 0
    item_cap = {}
    for post_key, st in rules.items():
        for it in st['items']:
            if isinstance(it.get('cap'), (int, float)):
                item_cap[(post_key, it['name'])] = it['cap']
    for s in sums:
        key = (s['emp'], s['post'], s['item'])
        if key not in derived:
            continue
        checked += 1
        cap = item_cap.get((s['post'], s['item']), 1)
        exp = max(0.0, min(cap, cap + derived[key]))
        if abs(exp - (s['score'] or 0)) > 1e-6:
            mismatch += 1

    # 个人当日积分：汇总表为准，汇总缺失的拿分项用明细推导补齐
    person_score = defaultdict(float)
    sum_keys = set()
    for s in s_rows:
        ps = person_list[s[0]]
        if s[2] >= 0:
            sum_keys.add((ps['code'], ps['post'], d_items[s[2]]))
        if s[6] is not None:
            person_score[(ps['code'], ps['post'])] += s[6]
    for d in details:
        if (d['emp'], d['post'], d['item']) in sum_keys:
            continue
        person_score[(d['emp'], d['post'])] += d['score']

    sales = []
    for p in person_list:
        cap = rules.get(p['post'], {}).get('capAvailable') or 1
        pts = person_score.get((p['code'], p['post']), 0) or 0
        ratio = max(0.0, min(1.0, pts / cap)) if cap else 0
        sales.append(gen_sales(store_list[store_idx[p['store']]]['code'], p['code'], p['post'], ratio))

    data = OrderedDict()
    data['meta'] = OrderedDict([
        ('version', VERSION),
        ('generatedAt', '2026-09-17'),
        ('dates', d_dates),
        ('sources', ['灯塔系统需求0910.xlsx', 'scoring_result_交付专员.xlsx', 'scoring_result_交付店长.xlsx']),
        ('realPosts', [k for _, k in SCORING_FILES]),
        ('note', '真实评分数据（单日快照）· 门店归属由门店名城市前缀自动映射，可在 tools/parse_lighthouse_%s.py 中人工修订' % VERSION),
    ])
    data['postRules'] = rules
    data['monthlyRules'] = monthly
    data['stores'] = store_list
    data['persons'] = [[p['code'], p['name'], p['post'], store_idx[p['store']]] for p in person_list]
    data['sales'] = sales
    data['dict'] = OrderedDict([('items', d_items), ('actions', d_actions), ('orders', d_orders)])
    data['details'] = OrderedDict([('cols', ['person', 'date', 'item', 'action', 'score', 'ok', 'ev', 'order']), ('rows', d_rows)])
    data['sums'] = OrderedDict([('cols', ['person', 'date', 'item', 'target', 'count', 'targetScore', 'score']), ('rows', s_rows)])

    out = os.path.join(OUT_DIR, 'lighthouse_scoring_%s.js' % VERSION)
    body = json.dumps(data, ensure_ascii=False, separators=(',', ':'))
    body = body.replace('</', '<\\/')
    header = (
        '/* 灯塔积分数据模块 %s —— 由 tools/parse_lighthouse_%s.py 生成，请勿手工编辑\n'
        ' * 数据日期：%s（真实评分数据单日快照）\n'
        ' * 覆盖：%d 个岗位规则 · %d 家专营店 · %d 名人员 · %d 条动作明细 · %d 条个人得分汇总\n'
        ' */\n' % (VERSION, VERSION, '/'.join(d_dates), len(rules), len(store_list), len(person_list), len(d_rows), len(s_rows))
    )
    with open(out, 'w', encoding='utf-8') as f:
        f.write(header)
        f.write('window.LH_SCORING = ')
        f.write(body)
        f.write(';\n')

    # ---------- 校验报告 ----------
    print('=' * 88)
    print('灯塔积分数据生成报告 %s' % VERSION)
    print('=' * 88)
    print('[规则主数据]')
    for k, st in rules.items():
        got = len(st['collected'])
        dep = sum(1 for it in st['items'] if it.get('deprecated'))
        print('  %-18s %-12s 拿分项 %2d 项(废弃 %d) · 封顶合计 %-5s · 声明满分 %-5s · 采用满分 %-5s · 已接入 %d 项 上限 %-4s %s' % (
            k, st['postName'], len(st['items']), dep, st['capSum'], st['capDeclared'],
            st['cap'], got, st['capCollected'],
            ('（' + '/'.join(st['collected']) + '）') if got else ''))
    print('  月度/扣分规则项：%d 条（来自「积分规则需求调研」）' % len(monthly))
    print('[真实评分数据]')
    print('  明细 %d 行 · 汇总 %d 行 · 评分日期 %s' % (len(d_rows), len(s_rows), '/'.join(d_dates)))
    print('  专营店 %d 家 · 人员 %d 人 · 拿分项 %d 个 · 动作 %d 个 · 订单号 %d 个' % (
        len(store_list), len(person_list), len(d_items), len(d_actions), len(d_orders)))
    print('  口径校验：拿分项得分 = 封顶 + Σ动作得分 → 参与校验 %d 条，不一致 %d 条' % (checked, mismatch))
    print('[组织映射]')
    rc = Counter(s['region'] for s in store_list)
    ac = Counter(s['area'] for s in store_list)
    print('  大区分布：' + ' · '.join('%s %d 家' % (r, rc[r]) for r in REGION_ORDER if rc.get(r)))
    print('  小区分布：' + ' · '.join('%s %d 家' % (a, ac[a]) for a in AREA_ORDER if ac.get(a)))
    if unmatched:
        print('  ⚠ 未命中城市前缀的门店 %d 家：%s' % (len(unmatched), '、'.join(unmatched[:10])))
    print('[产出]')
    print('  %s（%.1f KB）' % (out, os.path.getsize(out) / 1024.0))
    if WARNINGS:
        print('[告警]')
        for w in WARNINGS:
            print('  ⚠ ' + w)
    print('=' * 88)
    return 0


if __name__ == '__main__':
    sys.exit(main())
