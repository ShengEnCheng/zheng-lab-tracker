import { readFile } from 'node:fs/promises';
const env = Object.fromEntries((await readFile('.env.local', 'utf8')).split(/\r?\n/).filter(x => x && !x.startsWith('#')).map(x => { const i = x.indexOf('='); return [x.slice(0, i), x.slice(i + 1)]; }));
if (!env.SUPABASE_URL || !env.SUPABASE_ACCESS_TOKEN) throw new Error('需要 SUPABASE_URL 與 SUPABASE_ACCESS_TOKEN。');
const ref = new URL(env.SUPABASE_URL).hostname.split('.')[0];
const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: 'POST', headers: { authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, 'content-type': 'application/json' },
  body: JSON.stringify({ query: "select role, count(*)::int as active_count from public.lab_profiles where active = true group by role order by role" })
});
const rows = await response.json();
if (!response.ok) throw new Error(`角色查詢失敗 HTTP ${response.status}`);
const counts = Object.fromEntries(rows.map(row => [row.role, row.active_count]));
for (const role of ['admin', 'backup_admin']) console.log(`${counts[role] > 0 ? '✓' : 'ℹ'} ${role}: ${counts[role] || 0} active account(s)`);
if (!(counts.admin > 0)) process.exit(1);
