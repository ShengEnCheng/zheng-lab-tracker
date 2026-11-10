import { readFile } from 'node:fs/promises';

const envText = await readFile('.env.local', 'utf8');
const env = Object.fromEntries(envText.split(/\r?\n/)
  .filter(line => line.trim() && !line.trim().startsWith('#'))
  .map(line => {
    const i = line.indexOf('=');
    return i >= 0 ? [line.slice(0, i).trim(), line.slice(i + 1).trim()] : ['', ''];
  })
  .filter(([key]) => key));

const projectUrl = env.SUPABASE_URL || '';
const accessToken = env.SUPABASE_ACCESS_TOKEN || '';
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY || '';
const ref = projectUrl.match(/^https:\/\/([a-z0-9]+)\.supabase\.co\/?$/)?.[1];

if (!ref || !accessToken || !serviceRoleKey) {
  console.error('需要在 .env.local 設定 SUPABASE_URL, SUPABASE_ACCESS_TOKEN 與 SUPABASE_SERVICE_ROLE_KEY。');
  process.exit(1);
}

const adminEmail = (process.env.ADMIN_EMAIL || env.DEMO_AUTH_EMAIL || 'd1300706@cgu.edu.tw').trim().toLowerCase();
const adminPassword = process.env.ADMIN_PASSWORD || 'ZhengLab2026!';
const adminName = process.env.ADMIN_NAME || 'HJ (管理者)';
const adminCode = process.env.ADMIN_CODE || 'HJ';

async function sqlQuery(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ query: sql })
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`SQL 執行失敗 (HTTP ${res.status}): ${text}`);
  try { return JSON.parse(text); } catch { return text; }
}

console.log('🚀 開始執行實驗室測試資料全面重設...');

// 1. 清空稽核紀錄、備份記錄與舊名冊
console.log('1. 清空舊稽核日誌、備份紀錄與 Profile 名冊...');
await sqlQuery(`
  UPDATE public.lab_state SET updated_by = null;
  TRUNCATE TABLE public.lab_audit_logs, public.lab_backups, public.lab_backup_runs;
  TRUNCATE TABLE public.lab_profiles CASCADE;
  DELETE FROM auth.users;
`);
console.log('   ✓ 資料庫紀錄與舊 Auth 帳號已清空。');

// 2. 建立全新的 Admin Auth 帳號
console.log(`2. 透過 Supabase Admin API 建立全新 Admin 帳號：${adminEmail}...`);
const createRes = await fetch(`${projectUrl.replace(/\/$/, '')}/auth/v1/admin/users`, {
  method: 'POST',
  headers: {
    apikey: serviceRoleKey,
    authorization: `Bearer ${serviceRoleKey}`,
    'content-type': 'application/json'
  },
  body: JSON.stringify({
    email: adminEmail,
    password: adminPassword,
    email_confirm: true
  })
});
const createdUser = await createRes.json();
if (!createRes.ok || !createdUser?.id) {
  throw new Error(`建立 Admin Auth 帳號失敗: ${JSON.stringify(createdUser)}`);
}
const adminId = createdUser.id;
console.log(`   ✓ Admin 帳號建立成功，UUID: ${adminId}`);

// 3. 綁定 Admin Profile
console.log('3. 寫入 Admin Profile 到 lab_profiles...');
const safeName = adminName.replaceAll("'", "''");
const safeCode = adminCode.replaceAll("'", "''");
await sqlQuery(`
  INSERT INTO public.lab_profiles (id, email, display_name, member_code, role, active, created_at, updated_at)
  VALUES ('${adminId}', '${adminEmail}', '${safeName}', '${safeCode}', 'admin', true, now(), now());
`);
console.log(`   ✓ Admin Profile 綁定成功（角色：admin，代號：${adminCode}）。`);

// 4. 重設主資料庫 lab_state
console.log('4. 重設 lab_state 為全新空白研究資料（revision = 1）...');
const cleanData = {
  schemaVersion: 1,
  optBone: [],
  music40: [],
  customStudies: [],
  members: [
    {
      id: adminCode,
      name: adminName,
      role: 'admin',
      email: adminEmail,
      userId: adminId
    }
  ]
};
const safeDataJson = JSON.stringify(cleanData).replaceAll("'", "''");
await sqlQuery(`
  INSERT INTO public.lab_state (id, data, revision, schema_version, updated_at, updated_by)
  VALUES (1, '${safeDataJson}'::jsonb, 1, 1, now(), '${adminId}')
  ON CONFLICT (id) DO UPDATE SET
    data = excluded.data,
    revision = 1,
    schema_version = 1,
    updated_at = now(),
    updated_by = '${adminId}';
`);
console.log('   ✓ lab_state 已重設為乾淨版（個案數：0 筆，revision = 1）。');

console.log('\n========================================');
console.log('🎉 實驗室資料庫已完全重設為全新乾淨狀態！');
console.log(`管理者帳號：${adminEmail}`);
console.log(`管理者密碼：${adminPassword}`);
console.log(`管理者代號：${adminCode} (${adminName})`);
console.log('========================================\n');
