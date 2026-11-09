const apiBase = (process.env.ZHENG_API_BASE || '').replace(/\/$/, '');
const token = process.env.DEMO_ADMIN_ACCESS_TOKEN || '';
if (process.env.RUN_RESTORE_REHEARSAL !== 'YES') throw new Error('為避免誤還原，請設定 RUN_RESTORE_REHEARSAL=YES。');
if (!apiBase || !token) throw new Error('需要 ZHENG_API_BASE 與 DEMO_ADMIN_ACCESS_TOKEN。');
async function api(path, options = {}) {
  const r = await fetch(`${apiBase}${path}`, { ...options, headers: { authorization: `Bearer ${token}`, ...(options.headers || {}) } });
  const p = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${path} HTTP ${r.status}: ${JSON.stringify(p)}`);
  return p;
}
const before = await api('/data');
const cronSecret = process.env.CRON_SECRET || '';
if (!cronSecret) throw new Error('需要 CRON_SECRET 以建立演練備份。');
const backup = await fetch(`${apiBase}/backup`, { method: 'POST', headers: { authorization: `Bearer ${cronSecret}` } });
const backupPayload = await backup.json();
if (!backup.ok || !backupPayload.backupId) throw new Error(`建立演練備份失敗：${JSON.stringify(backupPayload)}`);
const listed = await api('/backups');
const candidate = (listed.backups || []).find(x => x.id === backupPayload.backupId);
if (!candidate || !candidate.checksum) throw new Error('找不到含 checksum 的演練備份。');
const restored = await api('/restore', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ backupId: candidate.id, requestId: crypto.randomUUID(), confirmation: 'RESTORE' }) });
if (!restored.beforeRestoreSnapshotId) throw new Error('還原回應缺少 beforeRestoreSnapshotId。');
const after = await api('/data');
if (after.revision <= before.revision) throw new Error(`還原後 revision 未遞增：${before.revision} -> ${after.revision}`);
console.log(`✓ 備份／還原演練成功：backup=${candidate.id} beforeRestore=${restored.beforeRestoreSnapshotId}`);
