# -*- coding: utf-8 -*-
"""临时勘察脚本：打印灯塔三张 Excel 的内部结构（用完即删）。"""
import glob, os, sys, openpyxl

BASE = os.path.expandvars(r'C:\Users\Administrator\AppData\Local\Temp\codebuddy-dropped-files')
REQ = glob.glob(os.path.join(BASE, '*', '灯塔系统需求0910.xlsx'))[0]


def dump(title, ws, max_row=None, max_col=None):
    print('=' * 100)
    print('SHEET:', title, 'dims', ws.max_row, 'x', ws.max_column)
    rmax = max_row or ws.max_row
    cmax = max_col or ws.max_column
    for r in range(1, rmax + 1):
        cells = []
        for c in range(1, cmax + 1):
            v = ws.cell(r, c).value
            if v is None:
                continue
            s = str(v).replace('\n', '\\n').strip()
            if not s:
                continue
            if len(s) > 60:
                s = s[:60] + '…'
            cells.append('%s%d=%s' % (openpyxl.utils.get_column_letter(c), r, s))
        if cells:
            print(' | '.join(cells))


if __name__ == '__main__':
    mode = sys.argv[1] if len(sys.argv) > 1 else 'rules'
    wb = openpyxl.load_workbook(REQ, data_only=True)
    if mode == 'rules':
        target = sys.argv[2] if len(sys.argv) > 2 else None
        names = [target] if target else [n for n in wb.sheetnames if n.endswith('日积分规则')]
        for n in names:
            dump(n, wb[n])
    elif mode == 'meta':
        for n in ['灯塔需求管控表', '积分规则需求调研', '灯塔门店人员岗位积分评价需求', 'Sheet2']:
            ws = wb[n]
            print('=' * 100)
            print('SHEET:', n, 'dims', ws.max_row, 'x', ws.max_column)
            for r in range(1, min(ws.max_row, 6) + 1):
                cells = []
                for c in range(1, ws.max_column + 1):
                    v = ws.cell(r, c).value
                    if v is None:
                        continue
                    s = str(v).replace('\n', '\\n').strip()[:40]
                    cells.append('%s:=%s' % (openpyxl.utils.get_column_letter(c), s))
                if cells:
                    print('R%d  ' % r + ' | '.join(cells))
    elif mode == 'brief':
        for n in [x for x in wb.sheetnames if x.endswith('日积分规则')]:
            ws = wb[n]
            print('=' * 100)
            print('SHEET:', n, 'dims', ws.max_row, 'x', ws.max_column, '| C5 =', ws['C5'].value)
            print('HDR15: ' + ' | '.join(
                '%s=%s' % (openpyxl.utils.get_column_letter(c), ws.cell(15, c).value)
                for c in range(1, ws.max_column + 1) if ws.cell(15, c).value))
            for r in range(16, ws.max_row + 1):
                a = ws.cell(r, 1).value
                if a is None:
                    continue
                cells = []
                for c in range(1, ws.max_column + 1):
                    v = ws.cell(r, c).value
                    if v is None:
                        continue
                    s = str(v).replace('\n', '\\n').strip()
                    if len(s) > 34:
                        s = s[:34] + '…'
                    cells.append('%s=%s' % (openpyxl.utils.get_column_letter(c), s))
                print('R%-3d' % r + ' | '.join(cells))
    elif mode == 'scoring':
        which = sys.argv[2]
        f = glob.glob(os.path.join(BASE, '*', 'scoring_result_%s.xlsx' % which))[0]
        swb = openpyxl.load_workbook(f, data_only=True)
        print('FILE', f)
        print('SHEETS', swb.sheetnames)
        for n in swb.sheetnames:
            ws = swb[n]
            print('-' * 100)
            print('SHEET:', n, 'dims', ws.max_row, 'x', ws.max_column)
            for r in range(1, min(ws.max_row, 4) + 1):
                cells = []
                for c in range(1, ws.max_column + 1):
                    v = ws.cell(r, c).value
                    s = '' if v is None else str(v).replace('\n', '\\n').strip()[:45]
                    cells.append('%s=%s' % (openpyxl.utils.get_column_letter(c), s))
                print('R%d  ' % r + ' | '.join(cells))
