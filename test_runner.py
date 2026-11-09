#!/usr/bin/env python3
"""
鄭老師研究室多案實驗管理與收案示警儀表板 - 自動化邏輯與語法測試腳本
"""
import re
import subprocess
import tempfile
import sys
import json
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
INDEX_HTML = BASE_DIR / "index.html"
INITIAL_DATA = BASE_DIR / "initial-data.json"
JSC_BIN = "/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc"

def test_initial_data_json():
    print("=== [Test 1] 驗證 initial-data.json ===")
    assert INITIAL_DATA.exists(), "initial-data.json 不存在"
    with open(INITIAL_DATA, "r", encoding="utf-8") as f:
        data = json.load(f)
    assert "optBone" in data and len(data["optBone"]) > 0, "缺少 optBone 資料"
    assert "music40" in data and len(data["music40"]) > 0, "缺少 music40 資料"
    assert "members" in data and len(data["members"]) > 0, "缺少 members 資料"
    print(f"  ✓ initial-data.json 結構正確 (optBone: {len(data['optBone'])}, music40: {len(data['music40'])}, members: {len(data['members'])})")

def test_javascript_logic():
    print("\n=== [Test 2] 驗證 index.html 內的 JavaScript 邏輯與示警運算 ===")
    assert INDEX_HTML.exists(), "index.html 不存在"
    with open(INDEX_HTML, "r", encoding="utf-8") as f:
        html = f.read()

    m = re.search(r"<script.*?>([\s\S]*?)<\/script>", html, re.IGNORECASE)
    assert m, "在 index.html 中找不到 <script> 區塊"
    script = m.group(1)

    test_js = """
// 模擬瀏覽器全域環境
let domEvents = {};
let elements = {};

function createMockElement(id) {
  return {
    id: id,
    value: '',
    checked: false,
    innerHTML: '',
    textContent: '',
    style: {},
    classList: {
      _classes: new Set(),
      add(c) { this._classes.add(c); },
      remove(c) { this._classes.delete(c); },
      contains(c) { return this._classes.has(c); },
      toggle(c) { if (this.contains(c)) this.remove(c); else this.add(c); }
    },
    addEventListener: () => {},
    querySelectorAll: () => [],
    querySelector: () => null,
    setAttribute: () => {},
    removeAttribute: () => {},
    click: () => {},
    focus: () => {}
  };
}

const window = {
  setInterval: () => 1,
  clearInterval: () => {},
  addEventListener: () => {},
  location: { reload: () => {} },
  scrollTo: () => {}
};

const document = {
  getElementById: (id) => {
    if (!elements[id]) elements[id] = createMockElement(id);
    return elements[id];
  },
  querySelector: (sel) => null,
  querySelectorAll: (sel) => [],
  createElement: (tag) => createMockElement(tag),
  addEventListener: (event, cb) => {
    domEvents[event] = cb;
  }
};

const localStorage = {
  _store: {},
  getItem: (k) => localStorage._store[k] || null,
  setItem: (k, v) => { localStorage._store[k] = String(v); },
  removeItem: (k) => { delete localStorage._store[k]; },
  clear: () => { localStorage._store = {}; }
};

const alert = (msg) => {};
const confirm = (msg) => true;

""" + script + """

let passCount = 0;
let failCount = 0;

function assert(cond, name) {
  if (cond) {
    print('  ✓ PASS: ' + name);
    passCount++;
  } else {
    print('  ✗ FAIL: ' + name);
    failCount++;
  }
}

// 1. 資料模型與預設值
const defaultData = getDefaultData();
assert(defaultData && typeof defaultData === 'object', 'getDefaultData 返回有效物件');
assert(Array.isArray(defaultData.optBone) && defaultData.optBone.length === 12, 'OPT_Bone 包含 12 筆受試者');
assert(Array.isArray(defaultData.music40) && defaultData.music40.length === 12, 'music40 包含 12 筆受試者');
assert(Array.isArray(defaultData.members) && defaultData.members.length === 5, '研究室成員名冊包含 5 位成員');

// 2. 日期運算函式
assert(addDays('2026-10-01', 28) === '2026-10-29', 'addDays: 2026-10-01 + 28 天 = 2026-10-29');
assert(addDays('2026-10-01', 0) === '2026-10-01', 'addDays: 0 天');
assert(addDays('', 28) === '', 'addDays: 空日期回傳空字串');
assert(diffDays('2026-10-15', '2026-10-10') === 5, 'diffDays: 2026-10-15 比 2026-10-10 晚 5 天');
assert(diffDays('2026-10-05', '2026-10-10') === -5, 'diffDays: 2026-10-05 比 2026-10-10 早 5 天 (負數)');

// 3. 示警規則 (evaluateMilestone)
assert(evaluateMilestone('', false, 'OPT_T', '2026-10-10').code === 'EMPTY', '未設定日期 -> EMPTY');
assert(evaluateMilestone('2026-10-01', true, 'OPT_T', '2026-10-10').code === 'DONE', '已完成優先標記為 DONE');
assert(evaluateMilestone('2026-10-01', false, 'OPT_T', '2026-10-10').code === 'OVERDUE', '早於基準日未完成 -> OVERDUE 逾期');
assert(evaluateMilestone('2026-10-12', false, 'OPT_T', '2026-10-10').code === 'RED_T', 'OPT_T 距到期日 <= 2 天 -> RED_T 閃燈');
assert(evaluateMilestone('2026-10-16', false, 'STANDARD', '2026-10-10').code === 'RED', '距到期日 <= 7 天 -> RED 紅燈');
assert(evaluateMilestone('2026-10-25', false, 'STANDARD', '2026-10-10').code === 'AMBER', '距到期日 8~21 天 -> AMBER 黃燈');
assert(evaluateMilestone('2026-11-10', false, 'STANDARD', '2026-10-10').code === 'GREEN', '距到期日 > 21 天 -> GREEN 綠燈');

// 4. 匯入資料驗證函式 (validateImportedData)
assert(validateImportedData(defaultData).length === 0, '合法資料通過驗證');
assert(validateImportedData(null).length > 0, 'null 輸入被阻擋');
assert(validateImportedData({}).length > 0, '缺少研究案陣列被阻擋');
assert(validateImportedData({ optBone: 'invalid string' }).length > 0, '型別錯誤安全阻擋 (無 TypeError)');
assert(validateImportedData({ optBone: [{ id: '' }], music40: [] }).length > 0, '缺少 ID 被阻擋');
assert(validateImportedData({ optBone: [{ id: 'S01', p1StartDate: '2026/10/24' }], music40: [] }).length > 0, '非 YYYY-MM-DD 格式被阻擋');

// 5. 匯入摘要函式 (summarizeImportedData)
const summary = summarizeImportedData(defaultData, 'backup.json');
assert(summary.includes('12') && summary.includes('OPT_Bone'), '匯入摘要包含筆數與研究案名稱');

// 6. DOMContentLoaded 與介面初始化
if (domEvents['DOMContentLoaded']) {
  domEvents['DOMContentLoaded']();
  assert(true, 'DOMContentLoaded 初始化成功執行');
}

// 7. 任務收集與關聯過濾
appData = getDefaultData();
const tasks = collectAllTasks(appData);
assert(tasks.length > 0, '成功收集全域任務清單 (' + tasks.length + ' 項任務)');
const hjTasks = tasks.filter(t => t.owner === 'DEMO-A');
assert(hjTasks.length > 0, '成功依負責人篩選任務 (DEMO-A 共有 ' + hjTasks.length + ' 項任務)');

print('\\n測試統計: ' + passCount + ' 通過, ' + failCount + ' 失敗');
if (failCount > 0) throw new Error('Unit tests failed');
"""

    with tempfile.NamedTemporaryFile("w", suffix=".js", delete=False) as tf:
        tf.write(test_js)
        tf_path = tf.name

    res = subprocess.run([JSC_BIN, tf_path], capture_output=True, text=True)
    print(res.stdout)
    if res.stderr:
        print("STDERR:", res.stderr)
    assert res.returncode == 0, "JavaScript 邏輯測試未通過！"

def main():
    try:
        test_initial_data_json()
        test_javascript_logic()
        print("\n🎉 所有測試全部通過！")
    except Exception as e:
        print(f"\n❌ 測試失敗: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
