import { readFile } from 'node:fs/promises';

function parseEnv(text) {
  return Object.fromEntries(text.split(/\r?\n/).filter(line => line.trim() && !line.trim().startsWith('#')).map(line => {
    const i = line.indexOf('='); return i >= 0 ? [line.slice(0, i).trim(), line.slice(i + 1).trim()] : ['', ''];
  }).filter(([key]) => key));
}
const env = parseEnv(await readFile('.env.local', 'utf8'));
const ref = env.SUPABASE_URL?.match(/^https:\/\/([a-z0-9]+)\.supabase\.co\/?$/)?.[1];
if (!ref || !env.SUPABASE_ACCESS_TOKEN) throw new Error('需要 .env.local 的 SUPABASE_URL 與 SUPABASE_ACCESS_TOKEN');
const demo = JSON.parse(await readFile('supabase/seed/demo-state.json', 'utf8'));
const json = JSON.stringify(demo).replaceAll("'", "''");
const sql = `insert into public.lab_state (id, data, revision, schema_version) values (1, '${json}'::jsonb, 1, 1) on conflict (id) do update set data = excluded.data, revision = 1, schema_version = 1, updated_at = now();`;
const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: 'POST', headers: { authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, 'content-type': 'application/json' }, body: JSON.stringify({ query: sql })
});
const body = await response.text();
if (!response.ok) throw new Error(`Demo seed failed HTTP ${response.status}: ${body.slice(0, 800)}`);
console.log('✓ 匿名化 Demo 主資料已寫入 lab_state，revision=1。');
