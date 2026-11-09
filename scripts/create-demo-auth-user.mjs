import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

function parseEnv(text) {
  return Object.fromEntries(text.split(/\r?\n/).filter(x => x && !x.startsWith('#')).map(x => { const i=x.indexOf('='); return [x.slice(0,i), x.slice(i+1)]; }));
}
const env = parseEnv(await readFile('.env.local', 'utf8'));
if (!env.DEMO_AUTH_EMAIL || !process.env.DEMO_AUTH_PASSWORD) throw new Error('需要 DEMO_AUTH_EMAIL 與暫時的 DEMO_AUTH_PASSWORD。');
const url = `${env.SUPABASE_URL.replace(/\/$/, '')}/auth/v1/signup`;
const args = ['-sS', '--ipv4', '--connect-timeout', '15', '--max-time', '30', '-X', 'POST', '-H', `apikey: ${env.SUPABASE_ANON_KEY}`, '-H', 'content-type: application/json', '--data-binary', '@-', '-w', '\n__STATUS__%{http_code}', url];
const result = spawnSync('curl', args, { input: JSON.stringify({ email: env.DEMO_AUTH_EMAIL, password: process.env.DEMO_AUTH_PASSWORD }), encoding: 'utf8' });
if (result.status !== 0) throw new Error(`Supabase Auth 網路連線失敗：${result.stderr || 'curl failed'}`);
const marker = result.stdout.lastIndexOf('__STATUS__');
const raw = marker >= 0 ? result.stdout.slice(0, marker).trim() : result.stdout.trim();
const status = marker >= 0 ? Number(result.stdout.slice(marker + '__STATUS__'.length).trim()) : 0;
let body; try { body = JSON.parse(raw); } catch { throw new Error(`Supabase 回應格式錯誤：${raw.slice(0, 300)}`); }
if (status < 200 || status >= 300) throw new Error(`建立測試帳號失敗 HTTP ${status}: ${body.msg || body.message || body.error_description || JSON.stringify(body).slice(0, 500)}`);
console.log(`✓ 測試 Auth 帳號建立成功：${env.DEMO_AUTH_EMAIL}`);
console.log(body.access_token ? '✓ 已取得測試 session（Token 不輸出）' : '✓ 帳號已建立；若啟用 email confirmation，請先確認信箱。');
