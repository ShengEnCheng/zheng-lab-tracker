import { readFile } from 'node:fs/promises';

function parseEnv(text) {
  return Object.fromEntries(text.split(/\r?\n/).filter(line => line.trim() && !line.trim().startsWith('#')).map(line => {
    const i = line.indexOf('='); return i >= 0 ? [line.slice(0, i).trim(), line.slice(i + 1).trim()] : ['', ''];
  }).filter(([key]) => key));
}
const env = parseEnv(await readFile('.env.local', 'utf8'));
const email = env.DEMO_AUTH_EMAIL;
const role = env.DEMO_AUTH_ROLE || 'researcher';
const ref = env.SUPABASE_URL?.match(/^https:\/\/([a-z0-9]+)\.supabase\.co\/?$/)?.[1];
if (!ref || !env.SUPABASE_ACCESS_TOKEN || !email) {
  throw new Error('需要 .env.local 的 SUPABASE_URL、SUPABASE_ACCESS_TOKEN、DEMO_AUTH_EMAIL');
}
if (!['researcher', 'study_manager', 'admin', 'backup_admin'].includes(role)) throw new Error('DEMO_AUTH_ROLE 不合法');
const safeEmail = email.replaceAll("'", "''");
const sql = `insert into public.lab_profiles (id, email, display_name, role) select id, email, split_part(email, '@', 1), '${role}'::public.lab_role from auth.users where lower(email) = lower('${safeEmail}') on conflict (id) do update set email = excluded.email, role = excluded.role, active = true, updated_at = now();`;
const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: 'POST', headers: { authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, 'content-type': 'application/json' }, body: JSON.stringify({ query: sql })
});
const body = await response.text();
if (!response.ok) throw new Error(`assign profile failed HTTP ${response.status}: ${body.slice(0, 800)}`);
console.log(`✓ 已將 ${email} 設為 ${role} 測試角色（不輸出密碼或 token）。`);
