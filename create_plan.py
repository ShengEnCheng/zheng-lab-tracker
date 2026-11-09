from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_CELL_VERTICAL_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.enum.style import WD_STYLE_TYPE
from pathlib import Path

OUT = Path('/Volumes/MACRAID/projects/zheng-lab-tracker/鄭老師研究室_多案實驗管理_系統修改優化計劃書.docx')

def set_cell_shading(cell, fill):
    tcPr = cell._tc.get_or_add_tcPr()
    shd = tcPr.find(qn('w:shd'))
    if shd is None:
        shd = OxmlElement('w:shd')
        tcPr.append(shd)
    shd.set(qn('w:fill'), fill)

def set_cell_text(cell, text, bold=False, color=None, size=9.5):
    cell.text = ''
    p = cell.paragraphs[0]
    p.paragraph_format.space_after = Pt(0)
    r = p.add_run(str(text))
    r.bold = bold
    r.font.size = Pt(size)
    if color:
        r.font.color.rgb = RGBColor(*color)
    set_font(r)
    cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER

def set_font(run, name='Noto Sans CJK TC'):
    run.font.name = name
    rPr = run._element.get_or_add_rPr()
    rFonts = rPr.rFonts
    if rFonts is None:
        rFonts = OxmlElement('w:rFonts')
        rPr.append(rFonts)
    rFonts.set(qn('w:eastAsia'), name)
    rFonts.set(qn('w:ascii'), name)
    rFonts.set(qn('w:hAnsi'), name)

def set_cell_margins(cell, top=80, start=100, bottom=80, end=100):
    tc = cell._tc
    tcPr = tc.get_or_add_tcPr()
    tcMar = tcPr.first_child_found_in('w:tcMar')
    if tcMar is None:
        tcMar = OxmlElement('w:tcMar')
        tcPr.append(tcMar)
    for m, v in [('top', top), ('start', start), ('bottom', bottom), ('end', end)]:
        node = tcMar.find(qn(f'w:{m}'))
        if node is None:
            node = OxmlElement(f'w:{m}')
            tcMar.append(node)
        node.set(qn('w:w'), str(v))
        node.set(qn('w:type'), 'dxa')

def add_table(doc, headers, rows, widths=None, font_size=9):
    table = doc.add_table(rows=1, cols=len(headers))
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.style = 'Table Grid'
    hdr = table.rows[0].cells
    for i, h in enumerate(headers):
        set_cell_text(hdr[i], h, bold=True, color=(255,255,255), size=font_size)
        set_cell_shading(hdr[i], '1F4E78')
        set_cell_margins(hdr[i])
    for ridx, row in enumerate(rows):
        cells = table.add_row().cells
        for i, value in enumerate(row):
            set_cell_text(cells[i], value, size=font_size)
            set_cell_margins(cells[i])
            if ridx % 2 == 1:
                set_cell_shading(cells[i], 'F3F6F9')
    if widths:
        for row in table.rows:
            for i, w in enumerate(widths):
                row.cells[i].width = Inches(w)
    doc.add_paragraph().paragraph_format.space_after = Pt(1)
    return table

def add_bullets(doc, items, level=0):
    for item in items:
        p = doc.add_paragraph(style='List Bullet' if level == 0 else 'List Bullet 2')
        p.paragraph_format.space_after = Pt(3)
        p.add_run(item)

def add_numbered(doc, items):
    for item in items:
        p = doc.add_paragraph(style='List Number')
        p.paragraph_format.space_after = Pt(3)
        p.add_run(item)

def add_callout(doc, title, text, fill='EAF2F8'):
    table = doc.add_table(rows=1, cols=1)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    cell = table.cell(0,0)
    set_cell_shading(cell, fill)
    set_cell_margins(cell, top=130, start=160, bottom=130, end=160)
    p = cell.paragraphs[0]
    p.paragraph_format.space_after = Pt(2)
    r = p.add_run(title)
    r.bold = True; r.font.size = Pt(11); r.font.color.rgb = RGBColor(31,78,121); set_font(r)
    p2 = cell.add_paragraph()
    p2.paragraph_format.space_after = Pt(0)
    r2 = p2.add_run(text); r2.font.size = Pt(10); set_font(r2)
    doc.add_paragraph().paragraph_format.space_after = Pt(1)

def heading(doc, text, level=1):
    p = doc.add_heading(text, level=level)
    p.paragraph_format.keep_with_next = True
    return p

def para(doc, text='', bold_prefix=None):
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(6)
    p.paragraph_format.line_spacing = 1.15
    if bold_prefix and text.startswith(bold_prefix):
        r = p.add_run(bold_prefix); r.bold = True; set_font(r)
        r2 = p.add_run(text[len(bold_prefix):]); set_font(r2)
    else:
        r = p.add_run(text); set_font(r)
    return p

# Document setup
doc = Document()
sec = doc.sections[0]
sec.top_margin = Inches(0.65); sec.bottom_margin = Inches(0.65)
sec.left_margin = Inches(0.75); sec.right_margin = Inches(0.75)

styles = doc.styles
styles['Normal'].font.size = Pt(10.5)
for sname, size, color in [('Normal', 10.5, '0F172A'), ('Title', 24, '1F4E78'), ('Heading 1', 17, '1F4E78'), ('Heading 2', 13, '2F5597'), ('Heading 3', 11, '404040')]:
    st = styles[sname]
    st.font.name = 'Noto Sans CJK TC'
    st.font.size = Pt(size)
    st.font.color.rgb = RGBColor.from_string(color)
    rPr = st._element.get_or_add_rPr()
    rFonts = rPr.rFonts
    if rFonts is None:
        rFonts = OxmlElement('w:rFonts')
        rPr.append(rFonts)
    rFonts.set(qn('w:eastAsia'), 'Noto Sans CJK TC')
    rFonts.set(qn('w:ascii'), 'Noto Sans CJK TC')
    rFonts.set(qn('w:hAnsi'), 'Noto Sans CJK TC')

# Header/footer
header = sec.header.paragraphs[0]
header.alignment = WD_ALIGN_PARAGRAPH.RIGHT
rh = header.add_run('鄭老師研究室｜多案實驗管理系統修改優化計劃書')
rh.font.size = Pt(8); rh.font.color.rgb = RGBColor(100,116,139); set_font(rh)
footer = sec.footer.paragraphs[0]
footer.alignment = WD_ALIGN_PARAGRAPH.CENTER
rf = footer.add_run('機密／研究室內部使用　　版本 1.0　　2026 年 11 月')
rf.font.size = Pt(8); rf.font.color.rgb = RGBColor(100,116,139); set_font(rf)

# Cover
p = doc.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.CENTER; p.paragraph_format.space_before = Pt(60)
r = p.add_run('鄭老師研究室'); r.bold = True; r.font.size = Pt(18); r.font.color.rgb = RGBColor(37,99,235); set_font(r)
p = doc.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.CENTER; p.paragraph_format.space_before = Pt(10)
r = p.add_run('多案實驗管理與收案示警儀表板'); r.bold = True; r.font.size = Pt(25); r.font.color.rgb = RGBColor(15,23,42); set_font(r)
p = doc.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.CENTER
r = p.add_run('系統修改優化計劃書'); r.bold = True; r.font.size = Pt(22); r.font.color.rgb = RGBColor(31,78,121); set_font(r)

for _ in range(3): doc.add_paragraph()
cover = add_table(doc, ['項目','內容'], [
    ['計劃依據', '《鄭老師研究室｜多案實驗管理與收案示警儀表板 操作介面調整需求說明》'],
    ['回饋文件日期', '2026/11/06（HJ）'],
    ['計劃版本', 'V1.0'],
    ['規劃日期', '2026/11/09'],
    ['適用範圍', 'OPT_Bone、music40、自訂多期程研究案、成員名冊、收案待辦、月曆、備份與多人協作'],
], widths=[1.35,5.75], font_size=10)
for row in cover.rows:
    set_cell_shading(row.cells[0], 'EAF2F8')

doc.add_paragraph()
add_callout(doc, '文件定位', '本計劃書將需求回饋轉換為可執行的產品、資料、技術與驗收方案；其中「第一階段安全性與操作修正」已可在現有純前端系統中完成，「多人共用資料與自動備份」則需進行後端架構升級。', 'FFF7E6')
doc.add_page_break()

# 1
heading(doc, '一、計劃摘要', 1)
para(doc, '本計劃的核心目標，是將目前「單一瀏覽器本機儲存、人工 JSON 同步」的研究排程工具，逐步提升為「操作安全、入口一致、資料可追溯，並能支援多人協作」的研究室管理平台。')
add_table(doc, ['優先級','工作主題','處理方式','目標成果'], [
    ['P0 立即', '資料安全與誤操作防護', '移除批次結案與一鍵還原；匯入前確認；保留逐筆完成', '降低誤結案、誤覆蓋與資料遺失'],
    ['P0 立即', '日期與篩選操作修正', '每日自動更新基準日；統一研究案管理入口；新增清除篩選', '降低空白頁面與舊日期造成的誤判'],
    ['P1 短期', '共享資料與版本控制', '建立具驗證的共用 API／資料儲存與版本衝突處理', '不同電腦可取得同一份最新資料'],
    ['P1 短期', '自動備份與還原流程', '定時備份、時間戳、管理者還原、匯入前快照', '可追溯、可復原、可稽核'],
    ['P2 中期', '報表與管理能力', '變更紀錄、備份歷史、權限、統計與通知', '支援研究室治理與長期維運'],
], widths=[0.8,1.6,2.7,2.0])
add_callout(doc, '建議決策', '先接受 P0 變更作為第一批上線版本，再以 Google 帳號為基礎建置共用後端。不要直接將 Google Drive API 憑證放入公開 GitHub Pages；前端應透過受保護的 Web App／API 存取資料。', 'EAF2F8')

# 2
heading(doc, '二、現況盤點與問題定義', 1)
heading(doc, '2.1 目前系統基礎', 2)
add_bullets(doc, [
    '技術型態：單一靜態 index.html，前端 JavaScript、CSS 與資料結構集中於同一檔案。',
    '資料儲存：瀏覽器 localStorage，資料只存在目前瀏覽器／裝置。',
    '備份方式：手動匯出／匯入 JSON。',
    '研究案：內建 OPT_Bone、music40，另支援自訂研究案與 Milestone Builder。',
    '核心功能：收案待辦、KPI、學生工作量、月曆、研究案管理表、成員名冊與日期自動推算。',
])
heading(doc, '2.2 主要風險', 2)
add_table(doc, ['風險','成因','影響','治理方向'], [
    ['跨裝置資料不一致', 'localStorage 為瀏覽器隔離儲存', '不同人看到不同排程，可能漏追蹤', 'P1 建置共用資料來源'],
    ['多人更新互相覆蓋', '無版本號、無鎖定或衝突偵測', '後存檔案覆蓋先前更新', '版本控制＋衝突提示'],
    ['誤結案', '批次將所有過期項目標為完成', '錯誤影響統計與後續追蹤', '僅保留逐筆人工完成'],
    ['資料被重置', '一鍵還原初始資料', '新增案、修改與完成紀錄消失', '移除入口＋匯入前確認'],
    ['入口與篩選不一致', '頁籤與全域研究案篩選各自運作', '空白表格造成資料遺失錯覺', '統一研究個案管理入口'],
    ['敏感研究資料外洩', '若直接公開雲端 API 或檔案', '未授權讀取／修改', 'Google 帳號驗證、最小權限、稽核'],
], widths=[1.35,2.05,2.05,1.65])

# 3 requirements
heading(doc, '三、需求拆解與解決方案', 1)
requirements = [
('需求 1｜多人共用資料、同步與備份', '最高優先',
 ['現況 localStorage 無法跨瀏覽器、跨電腦同步。', '人工 JSON 可備份，但無法避免同時編輯覆蓋。', '尚無定期自動備份與管理者還原流程。'],
 ['保留 JSON 匯出／匯入作為離線備援。', '新增共用後端資料來源；所有人從同一份資料讀寫。', '每筆資料加入 version、updatedAt、updatedBy。', '儲存時採樂觀鎖定：版本不一致即拒絕覆蓋並要求重新載入。', '建立每日自動備份與保留週期；備份檔帶日期時間。', '完整還原限管理者，並在還原前建立目前資料快照。'],
 '建議方案：Google Apps Script Web App + Google Drive JSON／Google Sheets 索引。研究室若已有 Google Workspace，可先以此方案驗證；若日後資料量或權限需求提高，再轉 Firebase／Supabase。'),
('需求 2｜判斷基準日每日更新', '高', ['基準日固定為舊日期。', '「設為今日」回到固定值。'], ['網站開啟時取瀏覽器本地時區日期。', '「設為今日」使用同一個 today 函式。', '月曆同步跳至當月。', '使用者仍可暫時手動選擇其他日期進行歷史檢視；重新開啟時回到當日。'], '已納入第一批修改。'),
('需求 3｜研究案篩選與管理入口統一', '高', ['研究案篩選與下方頁籤彼此獨立。', '新增自訂研究案集中於另一個入口。', '篩選後可能看到空白表格。'], ['頁籤固定為：收案待辦、月曆、研究個案管理。', '研究案／學生／示警狀態／關鍵字作為全域篩選。', '研究個案管理依研究案篩選顯示對應表格。', '全部研究案時顯示所有研究案；單一研究案時隱藏其他表格。'], '已納入第一批修改；後端版需沿用相同互動規則。'),
('需求 4｜新增個案負責人預設', '高', ['主要與次要負責人帶入既有預設，容易錯誤指派。', '次要欄位文字限定 music40。'], ['主要負責學生開啟時空白且必填。', '次要負責學生開啟時空白且選填。', '保留輸入／自動完成；既有研究案的節點負責人規則不變。'], '已納入第一批修改。'),
('需求 5｜移除標記過往完成', '高', ['批次將過去日期全部標成完成，可能錯誤結案。'], ['移除首頁按鈕及批次處理程式。', '逾期項目持續顯示逾期未完成。', '完成狀態只允許逐筆人工切換。'], '已納入第一批修改。'),
('需求 6｜移除還原預設、強化匯入保護', '高', ['一鍵還原會刪除後續新增與修改。'], ['移除還原預設入口。', '匯入前明確告知會覆蓋目前資料。', '取消時不改變目前資料。', '建議後端匯入前自動建立 current-before-import 快照。'], '已納入第一批修改；後端版再加入管理者權限與匯入稽核。'),
('需求 7｜回到首頁／清除篩選', '中', ['篩選條件與日期容易累積，使用者不易回到全貌。'], ['一鍵清除學生、研究案、狀態、關鍵字。', '基準日恢復今日、月曆回到當月。', '回到收案待辦。', '只重設視圖，不修改資料。'], '已納入第一批修改。'),
]
for title, priority, current, actions, note in requirements:
    heading(doc, title + f'（優先級：{priority}）', 2)
    para(doc, '目前問題：')
    add_bullets(doc, current, level=1)
    para(doc, '建議修改：')
    add_bullets(doc, actions, level=1)
    add_callout(doc, '處理狀態', note, 'F0FDF4' if '已納入' in note else 'FFF7E6')

# 4 architecture
heading(doc, '四、目標系統架構', 1)
heading(doc, '4.1 分階段架構策略', 2)
add_table(doc, ['層次','第一階段（目前）','第二階段（目標）'], [
    ['前端', 'GitHub Pages／靜態 HTML、JavaScript', '沿用前端 UI，增加 API client、登入狀態、同步狀態'],
    ['資料來源', 'localStorage', '共用 API + Google Drive JSON 或 Sheet；localStorage 作暫存／離線草稿'],
    ['身份驗證', '無', 'Google 帳號登入／白名單'],
    ['併發控制', '無', 'version + updatedAt + updatedBy 的樂觀鎖定'],
    ['備份', '人工 JSON', '排程自動備份、時間戳、保留版本、管理者還原'],
    ['稽核', '無', '變更紀錄：誰、何時、修改哪些欄位'],
], widths=[1.1,2.9,3.1])
heading(doc, '4.2 建議的 Google 服務方案', 2)
add_numbered(doc, [
    'Google Apps Script Web App：作為受保護的 API 閘道，處理身份、資料讀寫、版本檢查與備份。',
    'Google Drive：保存主資料 JSON、每日備份 JSON、匯出檔與還原快照。',
    'Google Sheets（可選）：保存備份索引、變更紀錄、管理者名單與簡易稽核報表。',
    'Google 帳號驗證：只允許研究室白名單帳號存取，不在前端放置服務帳密或 API 金鑰。',
])
add_callout(doc, '重要限制', 'Google Drive 本身不是多人編輯衝突解決器。若直接讓每個瀏覽器覆寫同一個檔案，仍會有資料遺失風險；必須由 Apps Script 統一處理版本檢查與寫入。', 'FDECEC')
heading(doc, '4.3 共用資料版本欄位', 2)
add_table(doc, ['欄位','用途','範例'], [
    ['schemaVersion', '資料格式版本，支援未來升級', '2.0'],
    ['revision', '整份資料的遞增版本號', '184'],
    ['updatedAt', '最後更新時間（ISO 8601）', '2026-11-09T08:30:00+08:00'],
    ['updatedBy', '最後更新者帳號或成員代號', 'hj@example.edu'],
    ['lastBackupAt', '最後成功備份時間', '2026-11-09T02:00:00+08:00'],
    ['changeId', '單次更新的唯一識別碼', 'uuid'],
], widths=[1.35,3.0,2.75])

# 5 workflow
heading(doc, '五、核心操作流程設計', 1)
heading(doc, '5.1 開啟網站與同步', 2)
add_numbered(doc, [
    '使用者以 Google 帳號登入。',
    '前端取得最新 revision 與資料摘要。',
    '若本機有未同步草稿，顯示「本機有未上傳變更」並要求選擇：上傳、捨棄或另存 JSON。',
    '成功載入後顯示「已同步：時間／使用者」。',
    '同步失敗時保留目前畫面，不清除本機資料，並提供重試與匯出。',
])
heading(doc, '5.2 編輯與儲存', 2)
add_numbered(doc, [
    '使用者修改日期、負責人或完成狀態。',
    '前端保留原 revision，送出變更。',
    '後端檢查 revision 是否仍為最新。',
    '版本一致：寫入新資料，revision +1，建立變更紀錄。',
    '版本不一致：拒絕覆蓋，提示「資料已被某人更新」，提供重新載入並比較。',
])
heading(doc, '5.3 匯入與還原', 2)
add_numbered(doc, [
    '使用者選擇 JSON。',
    '系統先驗證 schemaVersion、必要欄位與資料格式。',
    '顯示匯入摘要：研究案數、個案數、未完成任務數、檔案日期。',
    '非管理者只能匯入為「待審草稿」或在確認後覆蓋；正式還原限管理者。',
    '覆蓋前自動保存 current-before-import-時間戳.json。',
    '完成後顯示操作人、時間、來源檔案與新 revision。',
])

# 6 phases
heading(doc, '六、分階段執行計劃', 1)
add_table(doc, ['階段','預估工期','工作內容','交付物','通過條件'], [
    ['Phase 0：需求確認', '1–2 天', '確認 Google 帳號、管理者、資料敏感程度、備份保留天數', '決策紀錄、帳號白名單、資料政策', '所有關鍵決策有人負責'],
    ['Phase 1：前端安全修正', '已完成第一批', '日期、入口、負責人、批次完成、還原、匯入確認、清除篩選', '新版 index.html、README', 'P0 驗收案例全數通過'],
    ['Phase 2：共用後端 PoC', '3–5 天', 'Apps Script API、Drive 主檔、Google 登入／白名單、讀寫與 revision', 'API、部署說明、測試資料', '兩台電腦可讀寫同一資料'],
    ['Phase 3：備份與衝突治理', '3–5 天', '排程備份、匯入前快照、衝突提示、稽核紀錄、管理者還原', '備份流程、管理頁、復原手冊', '故意製造衝突可正確阻擋覆蓋'],
    ['Phase 4：試營運', '1–2 週', '小規模導入、監控錯誤、確認實際流程與權限', '試營運紀錄、問題清單', '連續一週無重大資料事故'],
    ['Phase 5：正式上線', '1–2 天', '凍結舊版、匯入正式資料、公告操作流程', '正式網址、SOP、備份排程', '使用者簽收與回復演練完成'],
], widths=[1.2,1.0,2.55,1.55,1.7], font_size=8.8)

# 7 data migration
heading(doc, '七、資料遷移與相容性策略', 1)
add_numbered(doc, [
    '先從目前瀏覽器匯出一份原始 JSON，另存為 migration-source-日期.json。',
    '建立資料清理報告：重複個案編號、空白主要負責人、無效日期、未知成員代號。',
    '將現有資料轉換為 schemaVersion 2.0，補上 revision、updatedAt、updatedBy 與備份欄位。',
    '在測試環境匯入，核對 OPT_Bone、music40、自訂研究案的個案數、節點數、完成狀態與日期。',
    '正式匯入前建立原始快照；上線後保留舊版 JSON 作為離線回復來源。',
])
add_table(doc, ['檢查項目','檢查方式','失敗處理'], [
    ['個案數', '逐研究案比對筆數', '停止上線，修正轉換腳本'],
    ['個案編號', '檢查唯一性與空白', '列入人工確認清單'],
    ['日期', '檢查 YYYY-MM-DD 與邏輯順序', '保留原值並標記異常'],
    ['負責人', '對照成員名冊', '未知代號不得自動刪除，需人工處理'],
    ['完成狀態', '比對 done 欄位與 KPI', '以原始 JSON 為準，禁止自動補完成'],
])

# 8 security
heading(doc, '八、資料安全、權限與備份政策', 1)
heading(doc, '8.1 最小權限角色', 2)
add_table(doc, ['角色','可查看','可修改','可匯入／還原','建議對象'], [
    ['一般研究人員', '研究室共用資料', '個案、排程、完成狀態', '可匯出；匯入需確認或待審', '研究助理、研究生'],
    ['研究案管理者', '所屬研究案與報表', '研究案設定、成員指派', '可核准匯入', '各研究案負責人'],
    ['系統管理者', '全部資料與紀錄', '全部設定', '可正式還原與管理備份', '指定教師／管理人'],
])
heading(doc, '8.2 備份政策建議', 2)
add_bullets(doc, [
    '每日自動備份一次，保留至少 30 個日備份。',
    '每週保留一份週備份，至少 12 週。',
    '每次正式匯入、還原或 schema migration 前，先建立事件快照。',
    '備份檔命名：zheng-lab-backup-YYYYMMDD-HHmmss-revNNN.json。',
    '備份只允許管理者刪除；下載／還原動作寫入稽核紀錄。',
    '研究資料若含可識別個資，應依研究倫理與校內資訊安全規範限制存取，不以公開連結分享。',
])

# 9 UI
heading(doc, '九、介面與操作規格', 1)
add_table(doc, ['區域','規格'], [
    ['頁首', '顯示登入者、同步狀態、最後同步時間、今日基準日、手動同步、匯出備份。'],
    ['全域篩選', '負責學生、研究案、示警狀態、受試者關鍵字；篩選條件作用於待辦、月曆、個案管理。'],
    ['主頁籤', '只保留：收案待辦、月曆、研究個案管理。'],
    ['研究個案管理', '全部研究案時顯示所有管理表；指定研究案時只顯示該案。'],
    ['清除篩選', '恢復全部學生、全部研究案、全部狀態、清除關鍵字、基準日設今日、回到待辦。'],
    ['新增個案', '主要負責人空白且必填；次要負責人空白且選填；沿用各研究案原有日期推算。'],
    ['匯入資料', '先做格式驗證與摘要，再提示覆蓋；取消不得變更目前資料。'],
    ['逾期任務', '未人工確認前永遠維持逾期未完成；不提供全域批次完成。'],
])

# 10 test
heading(doc, '十、測試與驗收計劃', 1)
add_table(doc, ['編號','測試案例','預期結果','優先級'], [
    ['T01', '在 2026/11/09 開啟網站', '基準日顯示 2026/11/09，月曆為 11 月', 'P0'],
    ['T02', '修改基準日後按設為今日', '恢復瀏覽器當日，不是固定日期', 'P0'],
    ['T03', '選 OPT_Bone，再切換研究個案管理', '只顯示 OPT_Bone 管理表，不顯示 music40 空白表', 'P0'],
    ['T04', '新增個案不填主要負責人', '阻止儲存並提示必填', 'P0'],
    ['T05', '新增個案不填次要負責人', '可正常儲存，次要欄位保持空白', 'P0'],
    ['T06', '執行清除篩選', '所有篩選清空、日期為今日、回到待辦', 'P0'],
    ['T07', '嘗試找批次標記過往完成', '首頁不存在該按鈕，逾期仍未完成', 'P0'],
    ['T08', '嘗試找還原預設', '首頁不存在該按鈕，資料不被重置', 'P0'],
    ['T09', '匯入合法 JSON 後按取消', '目前資料保持不變', 'P0'],
    ['T10', '兩台電腦同時修改同一筆資料（後端版）', '第二個儲存收到版本衝突，不可靜默覆蓋', 'P1'],
    ['T11', '自動備份失敗', '顯示失敗狀態並可重試，不刪除主資料', 'P1'],
    ['T12', '非管理者嘗試還原', '被拒絕並留下稽核紀錄', 'P1'],
])

# 11 risks and decisions
heading(doc, '十一、風險、決策與待確認事項', 1)
heading(doc, '11.1 主要風險與對策', 2)
add_table(doc, ['風險','機率','影響','對策'], [
    ['Google Apps Script 配額或服務中斷', '中', '同步／備份暫停', '保留 JSON 匯出、顯示同步狀態、提供離線備援'],
    ['多人衝突未被偵測', '中', '資料被覆蓋', 'revision 樂觀鎖定，衝突時拒絕寫入'],
    ['權限設定錯誤', '中', '未授權查看／修改', '白名單、管理者測試、定期檢視成員'],
    ['個資或研究資料暴露', '低至中', '倫理與資安風險', '最小化資料、帳號驗證、不可公開分享、備份權限控管'],
    ['資料格式升級失敗', '低', '系統無法載入', 'schemaVersion、migration、上線前快照與回復演練'],
], widths=[2.0,0.7,1.55,3.0])
heading(doc, '11.2 上線前需確認', 2)
add_bullets(doc, [
    '研究室正式使用的 Google Workspace 帳號與允許登入的 email 清單。',
    '指定至少一位系統管理者與一位備援管理者。',
    '備份保存期限、是否需要異地備份，以及誰可下載備份。',
    '資料是否包含可直接識別個資；若有，需確認校內研究倫理與資訊安全要求。',
    '多人同時編輯時採「衝突阻擋」還是「欄位級合併」；第一版建議採衝突阻擋，較安全。',
    '是否需要 email／Google Chat 通知；建議先完成資料正確性，再做通知。',
])

# 12 acceptance
heading(doc, '十二、最終驗收標準', 1)
add_callout(doc, '可上線條件', '以下條件全部達成，才進入正式多人使用；任何一項 P0 不通過，都應暫緩上線。', 'FFF7E6')
add_numbered(doc, [
    '不同電腦、不同瀏覽器登入後，能讀到同一份最新研究資料。',
    '兩人同時修改同一筆資料時，不會靜默覆蓋；系統會提示版本衝突。',
    '每日自動備份成功，備份檔具有日期時間與 revision，並可由管理者下載。',
    '匯入前會顯示覆蓋警告；取消後資料完全不變。',
    '管理者還原前會建立目前資料快照，還原後可追溯操作者與時間。',
    '逾期任務不會因日期更新或批次操作自動變成完成。',
    '所有七項需求的 P0／P1 驗收案例均有測試紀錄。',
    '完成一次實際回復演練：從備份檔還原並核對個案、日期、完成狀態與研究案數量。',
])

# appendix
heading(doc, '附錄 A：建議的第一批開發順序', 1)
add_numbered(doc, [
    '確認並保留目前已完成的前端安全修正。',
    '建立正式資料備份與 migration-source 快照。',
    '確認 Google 帳號、管理者與備份保存政策。',
    '建立 Apps Script API 的讀取端點與 revision 回傳。',
    '加入 Google 登入／白名單驗證。',
    '加入版本檢查的儲存端點與衝突提示。',
    '加入自動備份與管理者還原。',
    '進行兩台電腦、兩個帳號的試營運。',
])
heading(doc, '附錄 B：本次已完成的前端修正', 1)
add_bullets(doc, [
    '每日開啟網站與「設為今日」使用當日日期。',
    '研究案管理入口整合與全域研究案篩選同步。',
    '新增個案主要負責人必填、次要負責人選填且不自動帶入。',
    '移除「標記過往完成」與「還原預設」。',
    '匯入資料增加覆蓋確認。',
    '新增「回到首頁／清除篩選」。',
    'README 補充 localStorage 跨裝置限制與後端升級方向。',
])

# Save
# Set all table paragraph fonts / document core metadata
props = doc.core_properties
props.title = '鄭老師研究室｜多案實驗管理系統修改優化計劃書'
props.subject = '依據 2026/11/06 操作介面調整需求說明之完整修改與優化計劃'
props.author = '鄭老師研究室'
props.comments = '版本 1.0'
doc.save(OUT)
print(OUT)
