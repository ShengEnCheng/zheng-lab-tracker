import { methodAllowed, requireUserToken, sendJson, supabaseFetch } from './_supabase.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return methodAllowed(res, ['GET']);
  const token = requireUserToken(req, res);
  if (!token) return;
  try {
    const [backupsResponse, runsResponse] = await Promise.all([
      supabaseFetch('/rest/v1/lab_backups?select=id,source_revision,schema_version,checksum,created_at,kind&order=created_at.desc&limit=100', {}, token),
      supabaseFetch('/rest/v1/lab_backup_runs?select=id,kind,status,attempts,backup_id,source_revision,error_message,started_at,finished_at&order=started_at.desc&limit=100', {}, token)
    ]);
    const backups = await backupsResponse.json();
    const runs = await runsResponse.json();
    if (!backupsResponse.ok) return sendJson(res, backupsResponse.status, { error: 'backup_list_failed', details: backups });
    if (!runsResponse.ok) return sendJson(res, runsResponse.status, { error: 'backup_health_failed', details: runs });
    return sendJson(res, 200, { backups, runs });
  } catch (error) {
    if (error.message === 'supabase_not_configured') return sendJson(res, 503, { error: 'backend_not_configured' });
    console.error('backups api error', error);
    return sendJson(res, 503, { error: 'service_unavailable' });
  }
}
