"""Create human-editable workbook and matching local table DB; never overwrite edits."""
import json
import sqlite3
from pathlib import Path

from openpyxl import Workbook, load_workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.worksheet.table import Table, TableStyleInfo
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.utils import get_column_letter

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'data' / 'exercise-catalog'
XLSX = DEST / '운동DB_검토용.xlsx'
DB = DEST / '운동DB_검토용.sqlite'
if XLSX.exists() or DB.exists():
    raise SystemExit('Existing review files found. Preserve human edits; export to a new version instead.')
pack = json.loads((DEST / 'initial-drafts.json').read_text(encoding='utf-8'))

rows = {key: [] for key in ['운동목록', '회원안내', '강사참고', '출처', '검토사항']}
headers = {
    '운동목록': ['운동ID', '버전', '운동명', '분류', '자세', '도구', '검색별칭', '횟수형태', '세트', '횟수', '유지초', '휴식초', '검토상태', '검토자', '검토일', '수정메모'],
    '회원안내': ['항목ID', '운동ID', '운동명', '항목', '현재초안', '수정안', '출처후보ID', '검토상태', '검토메모'],
    '강사참고': ['항목ID', '운동ID', '운동명', '항목', '현재초안', '수정안', '출처후보ID', '검토상태', '검토메모'],
    '출처': ['출처ID', '운동ID', '운동명', '자료명', 'URL', '확인수준', '확인일', '확인범위와한계', '원문위치', '사용권리', '검토메모'],
    '검토사항': ['검토ID', '운동ID', '운동명', '구분', '확인할내용', '상태', '답변및보완안'],
}
labels = {
    'setup_steps': '시작 자세', 'execution_steps': '수행 순서',
    'attention_cues': '집중 포인트', 'breathing_cue': '호흡 안내', 'pause_note': '중단·문의 안내',
    'observation_points': '직접 관찰', 'subjective_questions': '회원에게 질문',
    'adjustment_options': '조정 후보', 'related_variants': '관련 변형',
}
levels = {'unverified': '미확인', 'page_retrieved': '페이지 접근 확인', 'search_excerpt_only': '검색 발췌만 확인'}
for item in pack['exercises']:
    key, name = item['stable_key'], item['name']
    rows['운동목록'].append([key, item['content_version'], name, item['category'],
        ', '.join(item['positions']), ', '.join(item['equipment']) or '추가 도구 없음',
        ', '.join(item['aliases']), '유지형' if item['defaults']['effort_kind'] == 'hold' else '횟수형',
        None, None, None, None, '검토 전', None, None, None])
    for sheet, section in [('회원안내', 'member'), ('강사참고', 'trainer')]:
        for field, value in item[section].items():
            entries = value if isinstance(value, list) else [value]
            for i, entry in enumerate(entries, 1):
                text = entry.get('text') if isinstance(entry, dict) else entry
                refs = ', '.join(entry['source_ids']) if isinstance(entry, dict) else None
                rows[sheet].append([f'{key}:{field}:{i}', key, name, labels[field], text, None, refs,
                    '검토 전', '미작성: 검토 후 수정안에 입력' if entry is None else None])
    for ref in item['references']:
        rows['출처'].append([ref['id'], key, name, ref['title'], ref['url'], levels[ref['verification']],
            ref['checked_on'], ref['note'], None, '미확인', None])
    for field, label in [('review_issues', '확인 필요'), ('withheld_claims', '사용 보류')]:
        for i, issue in enumerate(item[field], 1):
            rows['검토사항'].append([f'{key}:{field}:{i}', key, name, label, issue, '미해결', None])

wb = Workbook()
guide = wb.active
guide.title = '사용방법'
guide.append(['운동 DB 검토판', '초안 3개 · 사람 검토 전 · 운영 미반영'])
for row in [
    ['시작', '운동목록에서 전체를 보고, 회원안내·강사참고 시트에서 수정안을 입력하세요.'],
    ['편집 위치', '연한 노란색 칸이 주 편집 영역입니다. 원래 문장은 현재초안에 남깁니다.'],
    ['찾기', '각 표의 필터로 운동명이나 항목을 선택하세요. 첫 행과 운동 식별 열은 고정되어 있습니다.'],
    ['운동량', '세트·횟수·유지초·휴식초의 빈칸은 미정입니다. 0으로 간주하거나 회원 처방으로 자동 사용하지 않습니다.'],
    ['검토', '검토상태의 검토 완료는 사람의 편집 기록일 뿐 서비스 게시를 뜻하지 않습니다.'],
    ['출처', '출처후보ID는 확인할 자료의 연결입니다. 해당 문장이 원문에서 입증됐다는 뜻은 아닙니다.'],
    ['보류 사항', '검토사항 시트에서 변형 혼합, 각도·속도·평가 기준, 중단 안내 등을 점검하세요.'],
    ['파일과 DB', '이 엑셀과 운동DB_검토용.sqlite는 같은 초기 자료로 만들었습니다. 자동 동기화는 없습니다.'],
    ['이번 검토 기준', '엑셀을 편집본으로 사용하세요. 검토한 파일을 다시 전달하면 ID별 변경을 확인해 DB에 반영할 수 있습니다.'],
    ['DB 열기', 'SQLite를 읽을 수 있는 DB 도구에서 .sqlite 파일을 열면 동일한 한글 열 이름의 표 5개를 볼 수 있습니다.'],
    ['연결 상태', 'Supabase·회원 화면·자동 게시에는 연결하지 않았습니다. 이전 PGlite 검토본도 별도이며 변경하지 않습니다.'],
    ['식별자', '운동ID·항목ID·출처ID는 변경하지 마세요. 새 운동 추가는 별도 ID가 필요합니다.'],
]: guide.append(row)
guide.column_dimensions['A'].width = 23
guide.column_dimensions['B'].width = 104
guide.freeze_panes = 'B2'
for row in guide:
    for cell in row:
        cell.font = Font(name='맑은 고딕', size=11, color='243429')
        cell.alignment = Alignment(vertical='center', wrap_text=True)
    guide.row_dimensions[row[0].row].height = 42

editable = {'운동목록': [9,10,11,12,13,14,15,16], '회원안내': [6,8,9], '강사참고': [6,8,9], '출처': [9,10,11], '검토사항': [6,7]}
for index, (name, data) in enumerate(rows.items(), 1):
    ws = wb.create_sheet(name)
    ws.append(headers[name])
    for row in data: ws.append(row)
    ws.freeze_panes = 'D2'
    ws.sheet_view.zoomScale = 85
    ws.sheet_properties.pageSetUpPr.fitToPage = True
    ws.page_setup.orientation = 'landscape'
    ws.page_setup.paperSize = ws.PAPERSIZE_A3
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 0
    ws.print_title_rows = '1:1'
    for column, header in enumerate(headers[name], 1):
        width = 20
        if header in ['현재초안', '수정안', '확인할내용', '답변및보완안', '확인범위와한계']: width = 55
        elif header in ['자료명','검색별칭','검토메모','수정메모','URL']: width = 38
        elif header in ['운동ID','항목ID','검토ID']: width = 27
        elif header in ['버전','세트','횟수','유지초','휴식초']: width = 9
        ws.column_dimensions[get_column_letter(column)].width = width
    ws.row_dimensions[1].height = 30
    for row in ws:
        for cell in row:
            cell.font = Font(name='맑은 고딕', size=10, color='243429')
            cell.alignment = Alignment(vertical='top', wrap_text=True)
            if cell.row == 1:
                cell.fill = PatternFill('solid', fgColor='4A7C59')
                cell.font = Font(name='맑은 고딕', size=10, color='FFFFFF', bold=True)
            elif cell.column in editable[name]: cell.fill = PatternFill('solid', fgColor='FFF2CC')
        if row[0].row > 1: ws.row_dimensions[row[0].row].height = 88 if name in ['운동목록','출처','검토사항'] else 70
    table = Table(displayName=f'ExerciseReview{index}', ref=ws.dimensions)
    table.tableStyleInfo = TableStyleInfo(name='TableStyleMedium4', showRowStripes=True)
    ws.add_table(table)
    if name in ['운동목록','회원안내','강사참고','검토사항']:
        col = 13 if name == '운동목록' else 6 if name == '검토사항' else 8
        choices = '미해결,확인 중,해결,보류' if name == '검토사항' else '검토 전,수정 필요,검토 완료,보류'
        dv = DataValidation(type='list', formula1=f'"{choices}"', allow_blank=False)
        dv.errorTitle = '목록에서 선택해 주세요'
        dv.error = '정해진 검토 상태를 선택하세요.'
        dv.showErrorMessage = True
        dv.errorStyle = 'stop'
        ws.add_data_validation(dv)
        dv.add(f'{get_column_letter(col)}2:{get_column_letter(col)}{ws.max_row}')
    if name == '운동목록':
        for col, minimum in [('I',1),('J',1),('K',1),('L',0)]:
            dv = DataValidation(type='whole', operator='between', formula1=minimum, formula2=86400, allow_blank=True)
            dv.showErrorMessage = True
            dv.error = '미정이면 비워두고, 정수로 입력하세요. 값은 게시 전 별도 검토합니다.'
            ws.add_data_validation(dv)
            dv.add(f'{col}2:{col}{ws.max_row}')
    if name == '출처':
        for row in range(2, ws.max_row+1):
            ws.cell(row,5).hyperlink = ws.cell(row,5).value
            ws.cell(row,5).font = Font(name='맑은 고딕', size=10, color='0563C1', underline='single')
wb.save(XLSX)

with sqlite3.connect(DB) as conn:
    for name, data in rows.items():
        definitions = ', '.join(f'"{h}" {"INTEGER" if h in ["버전","세트","횟수","유지초","휴식초"] else "TEXT"}' for h in headers[name])
        primary = 'PRIMARY KEY ("운동ID", "버전")' if name == '운동목록' else f'PRIMARY KEY ("{headers[name][0]}")'
        conn.execute(f'CREATE TABLE "{name}" ({definitions}, {primary})')
        conn.executemany(f'INSERT INTO "{name}" VALUES ({",".join("?" for _ in headers[name])})', data)
    assert conn.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'

check = load_workbook(XLSX)
assert len(check.sheetnames) == 6
with sqlite3.connect(DB) as conn:
    for name, data in rows.items():
        assert check[name].max_row - 1 == len(data)
        assert conn.execute(f'SELECT count(*) FROM "{name}"').fetchone()[0] == len(data)
        assert list(check[name].values)[1:] == list(map(tuple, data))
        assert len(check[name].tables) == 1
    assert conn.execute('SELECT count(*) FROM "운동목록" WHERE "세트" IS NOT NULL').fetchone()[0] == 0
print(json.dumps({'xlsx': str(XLSX), 'sqlite': str(DB), 'rows': {k:len(v) for k,v in rows.items()}, 'integrity':'ok', 'sync':'manual'}, ensure_ascii=False))
