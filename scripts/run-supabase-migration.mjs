import { readFile } from 'node:fs/promises';

const envPath = '.env.local';
const sqlPath = 'supabase/migrations/001_lab_state.sql';
const envText = await readFile(envPath, 'utf8');
const env = Object.fromEntries(envText.split(/\r?\n/)
  .filter(line => line.trim() && !line.trim().startsWith('#'))
  .map(line => { const i = line.indexOf('='); return i >= 0 ? [line.slice(0, i).trim(), line.slice(i + 1).trim()] : ['', '']; })
  .filter(([key]) => key));

const projectUrl = env.SUPABASE_URL || '';
const accessToken = env.SUPABASE_ACCESS_TOKEN || '';
const ref = projectUrl.match(/^https:\/\/([a-z0-9]+)\.supabase\.co\/?$/)?.[1];
if (!ref || !accessToken) {
  console.error('需要在 .env.local 設定 SUPABASE_URL 與 SUPABASE_ACCESS_TOKEN。');
  console.error('Access token 只放本機 .env.local，不要貼到對話或提交 Git。');
  process.exit(1);
}
const sql = await readFile(sqlPath, 'utf8');
const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: 'POST',
  headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
  body: JSON.stringify({ query: sql })
});
const text = await response.text();
if (!response.ok) {
  console.error(`Supabase Management API migration failed (HTTP ${response.status})`);
  console.error(text.slice(0, 1200));
  process.exit(1);
}
console.log('✓ Supabase migration request completed.');
console.log('回傳摘要（不輸出 access token）：', text.slice(0, 500));
