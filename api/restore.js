import { methodAllowed, readJsonBody, requireUserToken, sendJson, supabaseFetch } from './_supabase.js';

function isUuid(value) {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return methodAllowed(res, ['POST']);
  const token = requireUserToken(req, res);
  if (!token) return;
  const body = await readJsonBody(req);
  if (!isUuid(body?.backupId) || !isUuid(body?.requestId) || body?.confirmation !== 'RESTORE') {
    return sendJson(res, 422, { error: 'invalid_restore_request', message: '需要 backupId、requestId 與 confirmation=RESTORE。' });
  }
  try {
    const response = await supabaseFetch('/rest/v1/rpc/restore_lab_backup', {
      method: 'POST',
      body: JSON.stringify({ p_backup_id: body.backupId, p_request_id: body.requestId })
    }, token);
    const payload = await response.json();
    if (!response.ok) {
      const raw = JSON.stringify(payload).toLowerCase();
      const status = raw.includes('not_authorized') ? 403 : raw.includes('backup_not_found') ? 404 : raw.includes('backup_integrity_failed') ? 422 : response.status;
      return sendJson(res, status, { error: status === 403 ? 'forbidden' : status === 422 ? 'backup_integrity_failed' : 'restore_failed', details: payload });
    }
    return sendJson(res, 200, payload);
  } catch (error) {
    if (error.message === 'supabase_not_configured') return sendJson(res, 503, { error: 'backend_not_configured' });
    console.error('restore api error', error);
    return sendJson(res, 503, { error: 'service_unavailable' });
  }
}
