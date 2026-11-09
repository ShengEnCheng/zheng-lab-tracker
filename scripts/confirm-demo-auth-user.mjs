import { readFile } from 'node:fs/promises';
function parseEnv(text) { return Object.fromEntries(text.split(/\r?\n/).filter(x=>x&&!x.startsWith('#')).map(x=>{const i=x.indexOf('=');return [x.slice(0,i),x.slice(i+1)]})); }
const env=parseEnv(await readFile('.env.local','utf8'));
const ref=env.SUPABASE_URL?.match(/^https:\/\/([a-z0-9]+)\.supabase\.co\/?$/)?.[1];
if(!ref||!env.SUPABASE_ACCESS_TOKEN||!env.DEMO_AUTH_EMAIL) throw new Error('需要 SUPABASE_URL、SUPABASE_ACCESS_TOKEN、DEMO_AUTH_EMAIL');
const email=env.DEMO_AUTH_EMAIL.replaceAll("'","''");
const sql=`update auth.users set email_confirmed_at = coalesce(email_confirmed_at, now()) where lower(email)=lower('${email}');`;
const r=await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`,{method:'POST',headers:{authorization:`Bearer ${env.SUPABASE_ACCESS_TOKEN}`,'content-type':'application/json'},body:JSON.stringify({query:sql})});
const body=await r.text();
if(!r.ok) throw new Error(`確認 email 失敗 HTTP ${r.status}: ${body.slice(0,500)}`);
console.log(`✓ 已在測試專案確認 ${env.DEMO_AUTH_EMAIL}，不輸出密碼或 Token。`);
