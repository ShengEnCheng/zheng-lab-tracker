import { readFile } from 'node:fs/promises';

const path = process.argv[2] || '.env.local';
let text;
try {
  text = await readFile(path, 'utf8');
} catch {
  console.error(`找不到 ${path}。請複製 .env.example 為 .env.local 並填入測試專案設定。`);
  process.exit(1);
}

const values = Object.fromEntries(text.split(/\r?\n/)
  .filter(line => line.trim() && !line.trim().startsWith('#'))
  .map(line => {
    const index = line.indexOf('=');
    return index >= 0 ? [line.slice(0, index).trim(), line.slice(index + 1).trim()] : ['', ''];
  }).filter(([key]) => key));

const errors = [];
if (!/^https:\/\/[^/]+\.supabase\.co\/?$/.test(values.SUPABASE_URL || '')) {
  errors.push('SUPABASE_URL 必須是 https://<project>.supabase.co');
}
if (!values.SUPABASE_ANON_KEY) errors.push('缺少 SUPABASE_ANON_KEY');
if (values.SUPABASE_SERVICE_ROLE_KEY && values.SUPABASE_SERVICE_ROLE_KEY.startsWith('ey')) {
  console.log('✓ 找到 server-only SUPABASE_SERVICE_ROLE_KEY（不會輸出 key 內容）');
}
if (errors.length) {
  for (const error of errors) console.error(`✗ ${error}`);
  process.exit(1);
}
console.log(`✓ Supabase URL 格式正確：${values.SUPABASE_URL}`);
console.log('✓ SUPABASE_ANON_KEY 已設定（內容不輸出）');
console.log('測試環境變數檢查通過。尚未代表已完成資料庫 migration 或登入測試。');
