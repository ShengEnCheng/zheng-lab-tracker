const baseUrl = (process.argv[2] || '').replace(/\/$/, '');
const secret = process.env.CRON_SECRET || '';
if (!baseUrl) {
  console.error('Usage: CRON_SECRET=... node scripts/verify-vercel-cron.mjs https://your-project.vercel.app');
  process.exit(2);
}
const response = await fetch(`${baseUrl}/api/health`);
const health = await response.json().catch(() => ({}));
if (!response.ok || health.status !== 'ok' || !health.backendConfigured) {
  throw new Error(`Health check failed: HTTP ${response.status} ${JSON.stringify(health)}`);
}
console.log('✓ Vercel health endpoint reports configured backend');
if (!secret) {
  console.log('! CRON_SECRET not provided; skipped authenticated backup invocation');
  process.exit(0);
}
const backup = await fetch(`${baseUrl}/api/backup`, { method: 'POST', headers: { authorization: `Bearer ${secret}` } });
const payload = await backup.json().catch(() => ({}));
if (!backup.ok || !payload.ok || !payload.backupId) throw new Error(`Backup invocation failed: HTTP ${backup.status} ${JSON.stringify(payload)}`);
console.log(`✓ Vercel backup endpoint succeeded backupId=${payload.backupId} revision=${payload.sourceRevision}`);
