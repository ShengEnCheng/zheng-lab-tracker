import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const files = {
  migration: await readFile('supabase/migrations/001_lab_state.sql', 'utf8'),
  backup: await readFile('api/backup.js', 'utf8'),
  backups: await readFile('api/backups.js', 'utf8'),
  restore: await readFile('api/restore.js', 'utf8'),
  importApi: await readFile('api/import.js', 'utf8')
};
const checks = [
  ['migration creates backup health runs', files.migration.includes('create table if not exists public.lab_backup_runs')],
  ['migration supports weekly backups', files.migration.includes("'weekly'")],
  ['migration computes jsonb checksum', files.migration.includes('jsonb_sha256')],
  ['migration snapshots before import', files.migration.includes("'before_import'") && files.migration.includes('current_row.data, public.jsonb_sha256')],
  ['migration snapshots before restore', files.migration.includes("'before_restore'") && files.migration.includes('before_restore_id')],
  ['migration rejects corrupted backups', files.migration.includes("backup_integrity_failed")],
  ['formal import is admin-only', files.migration.includes("current_lab_role() not in ('admin', 'backup_admin')")],
  ['backup job records failures', files.backup.includes("status: 'failed'") && files.backup.includes('error_message')],
  ['backup job prunes daily and weekly history', files.backup.includes('p_daily_keep: 30') && files.backup.includes('p_weekly_keep: 12')],
  ['backup job records checksum', files.backup.includes('create_lab_backup') && files.backup.includes('checksum')],
  ['backup list exposes health runs', files.backups.includes('lab_backup_runs') && files.backups.includes('runs')],
  ['restore maps integrity failure', files.restore.includes('backup_integrity_failed')],
  ['import passes request id and data', files.importApi.includes('p_data: body.data') && files.importApi.includes('p_request_id: body.requestId')]
];
let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? '✓' : '✗'} ${name}`);
  if (!ok) failed++;
}
for (const file of ['api/backup.js', 'api/backups.js', 'api/restore.js', 'api/import.js']) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    console.error(result.stderr || `${file} syntax check failed`);
    failed++;
  }
}
if (failed) process.exit(1);
console.log(`Backend contract checks passed (${checks.length} checks).`);
