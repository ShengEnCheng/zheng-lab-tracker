// 無瀏覽器套件的 UI 冒煙測試：用 headless Chrome 載入頁面，
// 在頁面內實際點擊頁籤、篩選與開啟彈窗，再把結果印回終端機。
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const CHROME = process.env.CHROME_BIN
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const html = readFileSync('index.html', 'utf8');
if (!html.includes('id="tab-action"')) throw new Error('index.html 缺少主要頁面結構');

const harness = `
<script>
window.__uiErrors = [];
window.addEventListener('error', e => window.__uiErrors.push(String(e.message)));
window.addEventListener('unhandledrejection', e => window.__uiErrors.push(String(e.reason)));

function report() {
  const results = [];
  const check = (name, fn) => {
    try { results.push({ name, ok: !!fn() }); }
    catch (error) { results.push({ name, ok: false, detail: String(error && error.message || error) }); }
  };
  const $ = sel => document.querySelector(sel);
  const visible = sel => { const el = $(sel); return !!el && !el.classList.contains('hidden'); };
  const setSelect = (id, value) => {
    const el = document.getElementById(id);
    el.value = value;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };

  // --- 初始結構 ---
  check('三個主頁籤', () => document.querySelectorAll('.tab-btn').length === 3);
  check('預設顯示收案待辦', () => visible('#tab-action') && !visible('#tab-calendar'));
  check('五張 KPI 卡片', () => document.querySelectorAll('.summary-card').length === 5);
  check('KPI 數值為數字', () => /^\\d+$/.test(document.getElementById('kpiOverdue').textContent.trim()));
  check('學生負擔卡片已渲染', () => document.querySelectorAll('.student-card').length >= 3);
  check('待辦表格有資料列', () => document.querySelectorAll('#actionTableBody tr').length > 0);
  check('月曆格數正確', () => document.querySelectorAll('.cal-day').length >= 28);
  check('月曆圖例存在', () => document.querySelectorAll('.cal-legend .legend-item').length === 6);
  check('管理頁表格已渲染', () => document.querySelectorAll('#optBoneTableBody tr').length > 0);

  // --- 頁籤切換 ---
  document.querySelector('[data-tab="tab-calendar"]').click();
  check('切換到月曆', () => visible('#tab-calendar') && !visible('#tab-action'));
  document.querySelector('[data-tab="tab-management"]').click();
  check('切換到研究個案管理', () => visible('#tab-opt-bone') && !visible('#tab-action'));

  // --- 研究案篩選只顯示對應表格 ---
  setSelect('studyFilter', 'music40');
  check('選 music40 只顯示 music40', () => visible('#tab-music40') && !visible('#tab-opt-bone'));
  setSelect('studyFilter', 'OPT_Bone');
  check('選 OPT_Bone 只顯示 OPT_Bone', () => visible('#tab-opt-bone') && !visible('#tab-music40'));
  setSelect('studyFilter', 'ALL');
  check('全部研究案顯示所有管理表', () => visible('#tab-opt-bone') && visible('#tab-music40'));

  // --- KPI 點擊即篩選 ---
  document.querySelector('.summary-card.overdue').click();
  check('點擊 KPI 套用狀態篩選', () => document.getElementById('statusFilter').value === 'OVERDUE');
  check('KPI 卡片呈現選取狀態', () => document.querySelector('.summary-card.overdue').classList.contains('active-filter'));

  // --- 關鍵字搜尋 ---
  const keyword = document.getElementById('keywordSearch');
  const firstName = (document.querySelector('.subject-id') || {}).textContent || '';
  keyword.value = firstName.trim();
  keyword.dispatchEvent(new Event('input', { bubbles: true }));
  check('關鍵字搜尋會過濾結果', () => document.querySelectorAll('#optBoneTableBody tr').length >= 1);

  // --- 重設視圖 ---
  document.getElementById('clearFiltersBtn').click();
  check('重設後回到收案待辦', () => visible('#tab-action'));
  check('重設後篩選全部清空', () => ['studentFilter', 'studyFilter', 'statusFilter']
    .every(id => document.getElementById(id).value === 'ALL') && keyword.value === '');

  // --- 彈窗 ---
  document.getElementById('openAddSubjectBtn').click();
  check('新增個案彈窗可開啟', () => document.getElementById('addSubjectModal').classList.contains('open'));
  check('主要負責人欄位預設空白', () => document.getElementById('newSubPrimaryOwner').value === '');
  check('次要負責人欄位預設空白', () => document.getElementById('newSubSecondOwner').value === '');
  document.querySelector('#addSubjectModal .modal-foot .btn-light').click();
  check('新增個案彈窗可關閉', () => !document.getElementById('addSubjectModal').classList.contains('open'));

  document.getElementById('openManageMembersBtn').click();
  check('人員名冊彈窗可開啟', () => document.getElementById('manageMembersModal').classList.contains('open'));
  document.querySelector('#manageMembersModal .modal-foot .btn').click();

  // --- 登入介面（未設定後端時仍可開啟） ---
  document.getElementById('authButton').click();
  check('登入彈窗可開啟', () => document.getElementById('authModal').classList.contains('open'));
  document.querySelector('#authModal .modal-close').click();

  // --- 版面度量 ---
  const headerHeight = Math.round(document.querySelector('.app-header').getBoundingClientRect().height);
  check('頁首在桌面寬度為單列', () => headerHeight < 90);
  check('頁面無水平溢出', () => document.documentElement.scrollWidth <= window.innerWidth + 1);
  check('未捕捉到 JavaScript 錯誤', () => window.__uiErrors.length === 0);

  const pre = document.createElement('pre');
  pre.id = 'ui-smoke-result';
  pre.textContent = JSON.stringify({ results, errors: window.__uiErrors, headerHeight, width: window.innerWidth }, null, 2);
  document.body.appendChild(pre);
}

window.addEventListener('load', () => setTimeout(report, 700));
</script>`;

const dir = mkdtempSync(join(tmpdir(), 'zheng-ui-'));
const pagePath = join(dir, 'ui-test.html');
writeFileSync(pagePath, html.replace('</body>', harness + '\n</body>'));

let dom;
try {
  dom = execFileSync(CHROME, [
    '--headless=old', '--disable-gpu', '--no-sandbox', '--window-size=1440,900',
    '--virtual-time-budget=6000', '--dump-dom', `file://${pagePath}`
  ], { encoding: 'utf8', timeout: 90000, maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
} finally {
  rmSync(dir, { recursive: true, force: true });
}

const match = dom.match(/<pre id="ui-smoke-result">([\s\S]*?)<\/pre>/);
if (!match) {
  console.error('✗ 找不到測試結果，頁面可能未完成載入。');
  process.exit(2);
}
const payload = JSON.parse(match[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));

let failed = 0;
for (const { name, ok, detail } of payload.results) {
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed++;
}
if (payload.errors.length) {
  console.log('\nJavaScript 錯誤：');
  payload.errors.forEach(e => console.log('  ' + e));
}
console.log(`\nUI 冒煙測試：${payload.results.length - failed} 通過，${failed} 失敗（頁首 ${payload.headerHeight}px / 寬度 ${payload.width}px）`);
process.exit(failed ? 1 : 0);
