// 資料安全測試：確認「資料看起來不見了」的三個成因都已經被擋住。
//
// 背景：使用者回報「下午查過網站，現在打開很多數據都不見了」。追查後發現
// 資料庫從建立至今一次都沒有被寫入過（lab_audit_logs 0 筆、lab_state 15 天
// 都是 revision 1 且內容全空）。他下午看到的「很多數據」其實是系統內建的
// 示範資料（DEMO-A~E、日期全是 2099 年），而畫面上完全沒有標示。
//
// 三個真正會讓使用者弄丟資料的地方：
//   1. 示範資料沒有任何標示 → 被當成真資料開始編輯
//   2. 未登入時可以編輯 → 資料只存在那台電腦的瀏覽器裡
//   3. 登入時 syncFromBackend() 直接覆蓋 appData → 剛輸入的東西無聲消失
//
// 這支測試用真的 Chrome 開 index.html（file://），並用
// window.__ZHENG_LAB_DATA_SAFETY__ = { protocol: 'https:' } 模擬「已部署在
// 網站上」。為什麼要模擬：headless Chrome 在這台機器上連不上任何
// http://127.0.0.1 位址（連一個 30 字元的最小頁面都會 ETIMEDOUT，換
// --headless=new、--user-data-dir、加 content-length 都一樣），而唯讀模式的
// 判斷依賴 location.protocol —— 用 file:// 直接測會測不到真正部署後的行為。

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const CHROME = process.env.CHROME_BIN
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const html = readFileSync('index.html', 'utf8');

// 真正能登入的人（來自 /api/profiles）
const REAL_PROFILES = [
  { id: '11111111-1111-4111-8111-111111111111', email: 'admin@cgu.edu.tw', display_name: 'admin', member_code: 'PI', role: 'admin', active: true }
];

// 共用資料庫的內容（空的 —— 這正是真實情況：15 天來一次都沒被寫入過）
const EMPTY_REMOTE_DATA = { schemaVersion: 1, members: [], optBone: [], music40: [], customStudies: [] };

// 使用者「以為是自己的」那一筆資料
const LOCAL_DATA = {
  schemaVersion: 1,
  members: [{ id: 'PI', name: 'PI', role: 'admin' }],
  optBone: [{
    id: 'REAL-01', name: '王小明', status: '收案中',
    t1Date: '2026-09-01', t1Owner: 'PI', t1Done: false
  }],
  music40: [],
  customStudies: []
};

const SESSION = {
  access_token: 'mock-access-token',
  refresh_token: 'mock-refresh-token',
  expires_at: 0, // 測試裡不驗證過期；refreshAuthSession 需要 refresh_token 但沒有 supabaseUrl 會失敗，所以給未來時間
  user: { id: REAL_PROFILES[0].id, email: REAL_PROFILES[0].email }
};
SESSION.expires_at = Math.floor(Date.now() / 1000) + 3600;

// ---------------------------------------------------------------------------
// 測試情境
// ---------------------------------------------------------------------------

const SCENARIOS = {
  'signed-out-empty': {
    title: '未登入 + 沒有資料（第一次打開網站）',
    setup: `
      // 未登入、瀏覽器沒存過資料 → 會載入內建示範資料
    `
  },
  'signed-out-with-local-data': {
    title: '未登入 + 有本機資料（原本會弄丟資料的情境）',
    setup: `
      localStorage.setItem(TEST_STORAGE_KEY, ${JSON.stringify(JSON.stringify(LOCAL_DATA))});
    `
  },
  'signed-in-empty-remote': {
    title: '已登入 + 共用資料庫是空的',
    setup: `
      localStorage.setItem(TEST_SESSION_KEY, ${JSON.stringify(JSON.stringify(SESSION))});
    `,
    remoteData: EMPTY_REMOTE_DATA
  },
  'signed-in-with-local-data': {
    title: '已登入 + 本機有資料（登入時不能無聲覆蓋）',
    setup: `
      localStorage.setItem(TEST_STORAGE_KEY, ${JSON.stringify(JSON.stringify(LOCAL_DATA))});
      localStorage.setItem(TEST_SESSION_KEY, ${JSON.stringify(JSON.stringify(SESSION))});
    `,
    remoteData: EMPTY_REMOTE_DATA
  },
  'signed-in-remote-has-data': {
    title: '已登入 + 共用資料庫已有資料（名冊要跟著重建）',
    setup: `
      // 這台電腦是新的，本機沒有資料，只有登入狀態
      localStorage.setItem(TEST_SESSION_KEY, ${JSON.stringify(JSON.stringify(SESSION))});
    `,
    // 共用資料庫裡有真實資料，但資料檔裡沒有成員名冊
    // （名冊存在 Auth 帳號 + lab_profiles，不在 lab_state.data 裡）
    remoteData: {
      schemaVersion: 1,
      members: [],
      optBone: [{ id: 'OPT-100', name: '李大同', status: '收案中', t1Date: '2026-10-01', t1Owner: 'PI', t1Done: false }],
      music40: [],
      customStudies: []
    }
  }
};

function buildHarness(name, scenario) {
  return `
<script>
window.__uiErrors = [];
window.__alerts = [];
window.__confirms = [];
window.addEventListener('error', e => window.__uiErrors.push(String(e.message)));
window.addEventListener('unhandledrejection', e => window.__uiErrors.push(String(e.reason)));

// headless Chrome 裡 alert() 會真的卡住整個頁面，一定要攔掉。
// confirm 預設回「取消」—— 這樣才驗得到「使用者不確認時資料不會被動到」；
// 需要走確認流程的斷言再自己把 window.__confirmAnswer 設成 true。
window.alert = message => { window.__alerts.push(String(message)); };
window.confirm = message => { window.__confirms.push(String(message)); return window.__confirmAnswer === true; };

// 模擬「已經部署在網站上」。這台機器上 headless Chrome 連不上 http://127.0.0.1，
// 所以用 file:// 開頁面，靠這個旗標讓 isReadOnly() 看到 https:。
window.__ZHENG_LAB_DATA_SAFETY__ = { protocol: 'https:' };

// 假的後端 —— 攔 fetch，不真的連網路
const REAL_PROFILES = ${JSON.stringify(REAL_PROFILES)};
const REMOTE_DATA = ${JSON.stringify(scenario.remoteData || EMPTY_REMOTE_DATA)};
window.__dataRequests = [];

window.fetch = async (url, options) => {
  const target = String(url);
  const method = (options && options.method) || 'GET';
  const respond = (body, status = 200) => ({
    ok: status < 400, status,
    json: async () => body,
    text: async () => JSON.stringify(body)
  });
  window.__dataRequests.push({ url: target, method });

  if (target.includes('/api/config')) {
    return respond({
      supabaseUrl: 'https://data-safety.supabase.co',
      anonKey: 'sb_publishable_datasafetytestkey000000000'
    });
  }
  if (target.includes('/api/profiles')) return respond({ profiles: REAL_PROFILES });
  if (target.includes('/api/data')) {
    if (method === 'POST') return respond({ revision: 2 });
    return respond({ data: REMOTE_DATA, revision: 1 });
  }
  if (target.includes('/auth/v1/')) {
    return respond({
      access_token: 'mock-access-token',
      refresh_token: 'mock-refresh-token',
      expires_at: ${SESSION.expires_at},
      user: { id: REAL_PROFILES[0].id, email: REAL_PROFILES[0].email }
    });
  }
  if (target.includes('/api/import')) return respond({ revision: 3 });
  return respond({});
};

// 情境設定（必須在主 script 執行前寫進 localStorage）
// 注意：不能宣告成 STORAGE_KEY / AUTH_SESSION_KEY —— 那兩個名字主 script
// 已經宣告過了，同一頁的 <script> 共用全域範疇，重複宣告會讓整個 script
// 拋 SyntaxError 而不執行（所有函式都變成 is not defined，非常難查）。
const TEST_STORAGE_KEY = 'ZHENG_LAB_DASHBOARD_DATA_V1';
const TEST_SESSION_KEY = 'ZHENG_LAB_AUTH_SESSION';
try {
  localStorage.clear();
  ${scenario.setup}
} catch (error) { window.__uiErrors.push('情境設定失敗：' + error.message); }
</script>`;
}

function buildReport(name) {
  return `
<script>
window.addEventListener('load', () => setTimeout(async () => {
  const results = [];
  const check = (label, fn) => {
    try { results.push({ label, ok: !!fn() }); }
    catch (error) { results.push({ label, ok: false, detail: String(error && error.message || error) }); }
  };

  const banner = document.getElementById('dataStateBanner');
  const rows = () => (window.appData?.optBone || []).length + (window.appData?.music40 || []).length;
  const bannerVisible = () => !!banner && !banner.hidden;
  const bannerKind = () => banner ? banner.dataset.kind : null;
  const visibleBtn = id => { const el = document.getElementById(id); return !!el && !el.hidden; };
  const titleText = () => (document.getElementById('dataStateTitle') || {}).textContent || '';
  const bodyText = () => (document.getElementById('dataStateText') || {}).textContent || '';

  const SCENARIO = ${JSON.stringify(name)};

  // .btn 自己有 display:inline-flex，會蓋掉瀏覽器預設的 [hidden]{display:none}。
  // 只看 el.hidden 會「通過」，但按鈕其實還畫在畫面上 —— 使用者會看到一堆
  // 跟目前狀態無關的按鈕。所以要驗「真的看不到」。
  const visuallyHidden = id => {
    const el = document.getElementById(id);
    if (!el) return true;
    return el.hidden === true && getComputedStyle(el).display === 'none';
  };

  // 未登入的兩個情境本來就沒有 token，backendEnabled() 自然是 false ——
  // 這正是要驗的：沒有身分時不該假裝存得進共用資料庫。
  if (SCENARIO.startsWith('signed-in')) {
    check('後端模式真的有開起來（否則後面的斷言在測假的）', () => backendEnabled() === true);
  } else {
    check('未登入時後端模式是關的（沒有身分就不該假裝能存）', () => backendEnabled() === false);
  }

  if (SCENARIO === 'signed-out-empty') {
    check('未登入且沒有資料時，畫面載入的是示範資料', () => isDemoData() === true);
    check('示範資料橫幅有出現', () => bannerVisible());
    check('橫幅標成示範資料', () => bannerKind() === 'demo');
    check('橫幅標題說明這是示範資料', () => /示範資料/.test(titleText()));
    check('橫幅說明這些修改不會存進共用資料庫', () => /共用資料庫/.test(bodyText()));
    check('未登入時禁止編輯', () => isReadOnly() === true);
    check('頁面進入唯讀模式', () => document.body.classList.contains('read-only-mode'));
    check('橫幅提供登入按鈕', () => visibleBtn('bannerAuthBtn'));
    check('示範資料提供「清除本機資料」', () => visibleBtn('bannerClearLocalBtn'));
    check('示範資料狀態不該出現「存進共用資料庫」（真的看不到）', () => visuallyHidden('bannerUploadBtn'));
    check('示範資料狀態不該出現「先匯出備份」（真的看不到）', () => visuallyHidden('bannerExportBtn'));

    // 唯讀時按下「新增個案」要被擋下來，而不是開表單讓使用者白填
    document.getElementById('openAddSubjectBtn').click();
    check('未登入按「新增個案」不會開表單', () =>
      !document.getElementById('addSubjectModal').classList.contains('open'));
    check('未登入按「新增個案」會提示要登入', () => window.__confirms.length === 1);
    check('提示文字說明修改不會存進共用資料庫', () =>
      window.__confirms.length === 1 && /共用資料庫/.test(window.__confirms[0]));

    // 打勾也要被擋（這是每天最常做的動作）
    document.getElementById('openAddStudyBtn').click();
    check('未登入按「新增研究案」也被擋下', () => window.__confirms.length === 2);
  }

  if (SCENARIO === 'signed-out-with-local-data') {
    check('有本機資料時不算示範資料', () => isDemoData() === false);
    check('橫幅標成本機資料', () => bannerKind() === 'local-only');
    check('橫幅說明資料還沒存進共用資料庫', () => /共用資料庫/.test(bodyText()));
    check('本機資料橫幅不能按「知道了」關掉', () =>
      document.getElementById('bannerDismissBtn').hidden === true);
    check('提供「先匯出備份」按鈕', () => visibleBtn('bannerExportBtn'));
    check('本機資料狀態不該出現「存進共用資料庫」', () => visuallyHidden('bannerUploadBtn'));
    check('本機資料還在畫面上（REAL-01）', () =>
      (window.appData?.optBone || []).some(row => row.id === 'REAL-01'));
    check('未登入時禁止編輯', () => isReadOnly() === true);

    // 打勾是每天最常做的事 —— 未登入打勾就會弄丟
    const before = JSON.stringify(window.appData.optBone[0].t1Done);
    toggleTaskDone('optBone', 0, 0, 't1Done');
    check('未登入時打勾不會改到資料', () =>
      JSON.stringify(window.appData.optBone[0].t1Done) === before);
    check('未登入時打勾會提示要登入', () => window.__confirms.length >= 1);
  }

  if (SCENARIO === 'signed-in-empty-remote') {
    check('已登入', () => !!currentProfile);
    check('已登入時可以編輯', () => isReadOnly() === false);
    check('頁面不在唯讀模式', () => !document.body.classList.contains('read-only-mode'));
    // 最關鍵：共用資料庫是空的，畫面絕對不能退回示範資料
    check('共用資料庫空的時候不會冒出示範資料', () => isDemoData() === false);
    check('畫面是 0 筆，不是 12 筆示範個案', () => rows() === 0);
    check('橫幅標成共用資料庫是空的', () => bannerKind() === 'remote-empty');
    check('橫幅說明這是正常的起始狀態', () => /正常/.test(titleText()));
    check('空資料時沒有「清除本機資料」按鈕', () =>
      document.getElementById('bannerClearLocalBtn').hidden === true);
    check('空資料時沒有「存進共用資料庫」按鈕', () =>
      document.getElementById('bannerUploadBtn').hidden === true);
    // 登入後 syncFromBackend() 會用共用資料庫的內容整份覆蓋 appData。
    // 共用資料庫的資料裡沒有成員名冊，所以名冊必須另外重建 —— 否則登入後
    // 人員名冊會整份消失，負責人下拉選單變成空的，使用者根本沒辦法指派。
    check('登入後成員名冊還在（不會被遠端資料蓋掉）', () =>
      (window.appData?.members || []).some(m => m.id === 'PI'));
    check('名冊代號用的是 member_code', () =>
      (window.appData?.members || []).every(m => !m.id || m.id === 'PI'));
    check('自訂研究案陣列存在（不會變成 undefined）', () =>
      Array.isArray(window.appData?.customStudies));
    // 已登入且空資料 → 可以正常新增
    document.getElementById('openAddSubjectBtn').click();
    check('已登入可以正常開新增個案的表單', () =>
      document.getElementById('addSubjectModal').classList.contains('open'));
  }

  if (SCENARIO === 'signed-in-with-local-data') {
    check('已登入', () => !!currentProfile);
    // 本次修的最關鍵一項：登入時不能把本機資料無聲蓋掉
    check('登入後本機資料沒有被無聲蓋掉（REAL-01 還在）', () =>
      (window.appData?.optBone || []).some(row => row.id === 'REAL-01'));
    check('橫幅標成「待上傳」', () => bannerKind() === 'pending-upload');
    check('橫幅說明有幾筆還沒存進共用資料庫', () => /1 筆/.test(titleText()));
    check('提供「存進共用資料庫」按鈕', () => visibleBtn('bannerUploadBtn'));
    check('提供「先匯出備份」按鈕', () => visibleBtn('bannerExportBtn'));
    check('待上傳時不能按「知道了」關掉', () =>
      document.getElementById('bannerDismissBtn').hidden === true);
    check('有未上傳資料時標記 pendingLocalUpload', () => pendingLocalUpload === true);
    // 使用者隨便改一格時，不能自動把整份本機資料推上去。
    // queueRemoteSave 用 350ms 的 setTimeout 去推，所以要等它真的跑過 —
    // 否則「沒有請求」只是因為還沒到時間，斷言等於沒驗。
    window.__dataRequests.length = 0;
    // 用 optional chaining：這裡是在驗「資料還在」，如果資料真的被蓋掉了，
    // 要留下一個失敗的斷言，而不是讓整個報告函式拋錯消失（那樣只會看到
    // 「沒有回傳結果」，查不出是哪一項壞掉）。
    if (window.appData?.optBone?.[0]) window.appData.optBone[0].name = '改個名字';
    saveData();
    await new Promise(resolve => setTimeout(resolve, 900));
    check('待上傳時不會自動同步到共用資料庫', () =>
      !window.__dataRequests.some(r => r.method === 'POST' && r.url.includes('/api/data')));

    // 使用者按「存進共用資料庫」時，資料要真的送出去（而不是按了沒反應）
    window.__confirmAnswer = true;   // 讓 uploadPendingLocalData 的確認通過
    window.__dataRequests.length = 0;
    await uploadPendingLocalData();
    check('按「存進共用資料庫」會真的把資料送上傳', () =>
      window.__dataRequests.some(r => r.method === 'POST' && r.url.includes('/api/data')));
    check('上傳成功後 pendingLocalUpload 被清掉', () => pendingLocalUpload === false);
  }

  if (SCENARIO === 'signed-in-remote-has-data') {
    check('已登入', () => !!currentProfile);
    check('畫面顯示共用資料庫的真實資料', () =>
      (window.appData?.optBone || []).some(row => row.id === 'OPT-100'));
    check('畫面不是示範資料', () => isDemoData() === false);
    check('橫幅標成「已連上共用資料庫」', () => bannerKind() === 'remote');
    // 關鍵：名冊存在 Auth 帳號 + lab_profiles，不在 lab_state.data 裡。
    // 整份覆蓋 appData 之後，名冊如果沒有另外重建就會整份消失。
    check('名冊被重建了（不是空的）', () =>
      (window.appData?.members || []).length > 0);
    check('名冊裡有真正有帳號的人（PI）', () =>
      (window.appData?.members || []).some(m => m.id === 'PI'));
    check('名冊沒有出現資料檔裡的外來成員', () =>
      !(window.appData?.members || []).some(m => String(m.id).startsWith('DEMO')));
  }

  check('未捕捉到 JavaScript 錯誤', () => window.__uiErrors.length === 0);
  const pre = document.createElement('pre');
  pre.id = 'data-safety-result';
  pre.textContent = JSON.stringify({
    scenario: SCENARIO, results, errors: window.__uiErrors,
    alerts: window.__alerts, confirmCount: window.__confirms.length, rowCount: rows()
  }, null, 2);
  document.body.appendChild(pre);
}, 2000));
</script>`;
}

// ---------------------------------------------------------------------------
// 執行
// ---------------------------------------------------------------------------

let totalFailed = 0;
let totalChecks = 0;

for (const [name, scenario] of Object.entries(SCENARIOS)) {
  // 注入點必須在主 script 之前，否則頁面在 script 最上層就讀走了設定
  const anchor = '  <script>\n    const STORAGE_KEY';
  if (!html.includes(anchor)) throw new Error('找不到注入點，index.html 結構已變動');

  const injected = html.replace(anchor, () => buildHarness(name, scenario) + '\n' + anchor);
  const page = injected.replace('</body>', () => buildReport(name) + '\n</body>');

  const dir = mkdtempSync(join(tmpdir(), `lab-safety-${name}-`));
  const pagePath = join(dir, 'index.html');
  writeFileSync(pagePath, page);

  let dom;
  try {
    dom = execFileSync(CHROME, [
      '--headless=old', '--disable-gpu', '--no-sandbox', '--window-size=1440,900',
      '--virtual-time-budget=25000', '--dump-dom', `file://${pagePath}`
    ], { encoding: 'utf8', timeout: 90000, maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  const match = dom.match(/<pre id="data-safety-result">([\s\S]*?)<\/pre>/);
  if (!match) {
    console.error(`\n✗【${scenario.title}】測試沒有回傳結果（頁面可能載入失敗）`);
    totalFailed += 1;
    continue;
  }
  const payload = JSON.parse(match[1]
    .replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));

  console.log(`\n【${scenario.title}】`);
  for (const { label, ok, detail } of payload.results) {
    totalChecks += 1;
    console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
    if (!ok) totalFailed += 1;
  }
  if (payload.errors.length) {
    for (const error of payload.errors) console.log(`  JavaScript 錯誤：${error}`);
  }
}

console.log(`\n資料安全測試：${totalChecks - totalFailed} 通過，${totalFailed} 失敗`);
process.exit(totalFailed ? 1 : 0);
