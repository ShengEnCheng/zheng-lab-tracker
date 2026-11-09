import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const required = [
  'index.html', 'initial-data.json', 'package.json', 'vercel.json', '.env.example',
  'api/health.js', 'api/config.js', 'api/data.js', 'api/import.js', 'api/restore.js', 'api/backup.js', 'api/backups.js',
  'supabase/migrations/001_lab_state.sql'
];
for (const file of required) {
  if (!existsSync(file)) throw new Error(`缺少必要檔案：${file}`);
}
const html = await readFile('index.html', 'utf8');
const migration = await readFile('supabase/migrations/001_lab_state.sql', 'utf8');
const checks = {
  'three main tabs': (html.match(/class="tab-btn/g) || []).length === 3,
  'no fixed reference date': !html.includes('2026-10-24'),
  'dangerous batch actions removed': !html.includes('markPastDoneBtn') && !html.includes('resetDefaultBtn'),
  'import validation': html.includes('validateImportedData') && html.includes('summarizeImportedData'),
  'Taipei date logic': html.includes('Asia/Taipei'),
  'global management filters': html.includes('renderCustomStudies(allTasks, studentFilter, studyFilter, statusFilter, keyword)'),
  'backend import wiring': html.includes("/import") && html.includes('remoteRevision = Number(payload.revision'),
  'restore-before snapshot': migration.includes("'before_restore'") && migration.includes('beforeRestoreSnapshotId'),
  'backup integrity checksum': migration.includes('jsonb_sha256') && migration.includes('backup_integrity_failed'),
  'backup health tracking': migration.includes('lab_backup_runs'),
  'login UI': html.includes('id="authForm"') && html.includes('id="authButton"'),
  'session refresh': html.includes('refreshAuthSession') && html.includes('grant_type=refresh_token')
};
for (const [name, ok] of Object.entries(checks)) console.log(`${ok ? '✓' : '✗'} ${name}`);
if (Object.values(checks).some(ok => !ok)) process.exit(1);
for (const file of ['api/_supabase.js', 'api/health.js', 'api/config.js', 'api/data.js', 'api/import.js', 'api/restore.js', 'api/backup.js', 'api/backups.js', 'src/lib/data-store.js', 'src/lib/schema.js', 'src/lib/auth-client.js']) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || 'JavaScript syntax check failed\n');
    process.exit(result.status || 1);
  }
}
console.log('✓ API JavaScript syntax');
console.log('Project checks passed. Backend activation still requires Supabase migration and Vercel environment variables.');
