// 備份 kind 健檢：確認線上資料庫真的接受排程備份會用到的每一種 kind。
//
// 為什麼需要這支：`api/backup.js` 在台北時間週日會呼叫 create_lab_backup('weekly')，
// 但線上 lab_backups 的 check 約束有一段時間缺少 'weekly'，導致每週日備份
// 靜默失敗（只有 lab_backup_runs 留下一筆 failed，沒有任何人收到通知）。
// 契約測試只讀檔案，看不出資料庫實際的約束長什麼樣，所以要用真的 RPC 打一次。
//
// 做法：逐一呼叫 create_lab_backup(p_kind)，成功就把剛建立的那筆備份刪掉，
// 失敗就回報是哪一種 kind 被資料庫拒絕。偵測完不會留下任何資料。
//
// 用法：node scripts/verify-backup-kinds.mjs
// 需要 .env.local 的 SUPABASE_URL 與 SUPABASE_SERVICE_ROLE_KEY。

import { readFile } from 'node:fs/promises';

const KINDS = ['scheduled', 'weekly'];

const envText = await readFile('.env.local', 'utf8');
const env = Object.fromEntries(envText.split(/\r?\n/)
  .filter(line => line.trim() && !line.trim().startsWith('#'))
  .map(line => { const i = line.indexOf('='); return i >= 0 ? [line.slice(0, i).trim(), line.slice(i + 1).trim()] : ['', '']; })
  .filter(([key]) => key));

const url = (env.SUPABASE_URL || '').replace(/\/$/, '');
const key = env.SUPABASE_SERVICE_ROLE_KEY || '';
if (!url || !key) {
  console.error('需要在 .env.local 設定 SUPABASE_URL 與 SUPABASE_SERVICE_ROLE_KEY。');
  process.exit(1);
}

const headers = { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json' };

async function callRpc(path, body) {
  const response = await fetch(`${url}/rest/v1/rpc/${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = { raw: text }; }
  return { ok: response.ok, status: response.status, payload };
}

let failed = 0;
for (const kind of KINDS) {
  const result = await callRpc('create_lab_backup', { p_kind: kind });
  if (!result.ok) {
    failed += 1;
    console.log(`✗ ${kind}: 資料庫拒絕 —— ${result.payload?.message || JSON.stringify(result.payload)}`);
    continue;
  }
  const backupId = result.payload?.backupId;
  console.log(`✓ ${kind}: 建立成功（checksum ${String(result.payload?.checksum || '').slice(0, 12)}…）`);
  if (backupId) {
    const del = await fetch(`${url}/rest/v1/lab_backups?id=eq.${backupId}`, { method: 'DELETE', headers });
    console.log(`  健檢用的備份已刪除（HTTP ${del.status}）`);
  }
}

if (failed) {
  console.log('');
  console.log('資料庫的 lab_backups kind 約束與 migration 不一致。');
  console.log('修法：在 Supabase Dashboard → SQL Editor 執行 supabase/migrations/002_repair_backup_kind.sql');
  process.exit(1);
}
console.log('');
console.log('備份 kind 健檢通過：排程與每週備份都能寫入。');
