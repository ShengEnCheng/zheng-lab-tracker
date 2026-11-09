import { readFile } from 'node:fs/promises';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

function parseEnv(text) {
  return Object.fromEntries(text.split(/\r?\n/).filter(x => x && !x.startsWith('#')).map(x => { const i=x.indexOf('='); return [x.slice(0,i), x.slice(i+1)]; }));
}
const env = parseEnv(await readFile('.env.local', 'utf8'));
if (!env.DEMO_AUTH_EMAIL || !process.env.DEMO_AUTH_PASSWORD) throw new Error('請以 DEMO_AUTH_PASSWORD 環境變數提供測試密碼，不要寫入檔案。');
const base = env.SUPABASE_URL.replace(/\/$/, '');
function curlJson(url, body, token = '') {
  const args = ['-sS', '--ipv4', '--connect-timeout', '15', '--max-time', '30', '-X', 'POST', '-H', `apikey: ${env.SUPABASE_ANON_KEY}`, '-H', 'content-type: application/json'];
  if (token) args.push('-H', `authorization: Bearer ${token}`);
  args.push('--data-binary', '@-', '-w', '\\n__STATUS__%{http_code}', url);
  const result = spawnSync('curl', args, { input: JSON.stringify(body), encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`Supabase 網路連線失敗：${(result.stderr || '').trim() || 'curl failed'}`);
  const marker = result.stdout.lastIndexOf('__STATUS__');
  const raw = marker >= 0 ? result.stdout.slice(0, marker).trim() : result.stdout.trim();
  const status = marker >= 0 ? Number(result.stdout.slice(marker + '__STATUS__'.length).trim()) : 0;
  let payload = {};
  try { payload = JSON.parse(raw); } catch { throw new Error(`Supabase 回應不是 JSON：${raw.slice(0, 300)}`); }
  return { status, payload };
}
const auth = curlJson(`${base}/auth/v1/token?grant_type=password`, { email: env.DEMO_AUTH_EMAIL, password: process.env.DEMO_AUTH_PASSWORD });
const session = auth.payload;
if (auth.status < 200 || auth.status >= 300 || !session.access_token) throw new Error(`登入失敗 HTTP ${auth.status}: ${JSON.stringify(session).slice(0, 500)}`);
console.log('✓ Supabase Auth 登入成功（Token 不輸出）');
function curlGet(url, token) {
  const result = spawnSync('curl', ['-sS', '--ipv4', '--connect-timeout', '15', '--max-time', '30', '-H', `apikey: ${env.SUPABASE_ANON_KEY}`, '-H', `authorization: Bearer ${token}`, url], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`Supabase 網路連線失敗：${(result.stderr || '').trim()}`);
  return JSON.parse(result.stdout);
}
const rows = curlGet(`${base}/rest/v1/lab_state?select=data,revision,schema_version&id=eq.1`, session.access_token);
if (!rows.length) throw new Error('登入後讀取 lab_state 失敗：沒有主資料');
console.log(`✓ 登入後讀取成功 revision=${rows[0].revision}`);
const requestId = crypto.randomUUID();
const write = curlJson(`${base}/rest/v1/rpc/apply_lab_state_change`, { p_base_revision: rows[0].revision, p_request_id: requestId, p_data: rows[0].data }, session.access_token);
if (write.status < 200 || write.status >= 300) throw new Error(`revision 寫入失敗 HTTP ${write.status}: ${JSON.stringify(write.payload).slice(0, 500)}`);
console.log(`✓ revision 寫入成功，新 revision=${write.payload.revision}`);
