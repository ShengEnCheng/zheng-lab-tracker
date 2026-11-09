import { methodAllowed, sendJson, supabaseServerFetch } from './_supabase.js';

function authorized(req) {
  const cron = req.headers['x-vercel-cron'] === '1';
  const secret = process.env.CRON_SECRET;
  const supplied = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  return cron || (secret && supplied === secret);
}

function taipeiKind() {
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Taipei', weekday: 'short' }).format(new Date());
  return weekday === 'Sun' ? 'weekly' : 'scheduled';
}

async function writeRun(runId, patch) {
  return supabaseServerFetch(`/rest/v1/lab_backup_runs?id=eq.${runId}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(patch)
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') return methodAllowed(res, ['GET', 'POST']);
  if (!authorized(req)) return sendJson(res, 401, { error: 'unauthorized' });

  const kind = taipeiKind();
  let runId;
  try {
    const run = await supabaseServerFetch('/rest/v1/lab_backup_runs', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ kind, status: 'running', attempts: 1 })
    });
    const runRows = await run.json();
    if (!run.ok) return sendJson(res, run.status, { error: 'backup_run_start_failed', details: runRows });
    runId = runRows?.[0]?.id;

    const response = await supabaseServerFetch('/rest/v1/rpc/create_lab_backup', {
      method: 'POST',
      body: JSON.stringify({ p_kind: kind })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result?.message || result?.error || 'backup_create_failed');

    const prune = await supabaseServerFetch('/rest/v1/rpc/prune_lab_backups', {
      method: 'POST',
      body: JSON.stringify({ p_daily_keep: 30, p_weekly_keep: 12 })
    });
    const pruneResult = await prune.json();
    if (!prune.ok) throw new Error(pruneResult?.message || pruneResult?.error || 'backup_prune_failed');

    if (runId) await writeRun(runId, {
      status: 'succeeded',
      backup_id: result.backupId,
      source_revision: result.sourceRevision,
      finished_at: new Date().toISOString()
    });
    return sendJson(res, 200, {
      ok: true,
      ...result,
      checksum: result.checksum,
      runId,
      prunedCount: Number(pruneResult) || 0
    });
  } catch (error) {
    if (runId) {
      await writeRun(runId, {
        status: 'failed',
        error_message: String(error.message || 'backup_unavailable').slice(0, 1000),
        finished_at: new Date().toISOString()
      }).catch(() => {});
    }
    if (error.message === 'supabase_not_configured') return sendJson(res, 503, { error: 'backend_not_configured' });
    console.error('backup api error', error);
    return sendJson(res, 503, { error: 'backup_unavailable', message: '備份失敗，主資料未被刪除，可稍後重試。' });
  }
}
