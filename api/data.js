import {
  methodAllowed, readJsonBody, requireUserToken, sendJson, supabaseFetch
} from './_supabase.js';
import { validateLabData } from '../src/lib/schema.js';

function isValidUuid(value) {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) return methodAllowed(res, ['GET', 'POST']);
  const token = requireUserToken(req, res);
  if (!token) return;

  try {
    if (req.method === 'GET') {
      const response = await supabaseFetch('/rest/v1/lab_state?id=eq.1&select=id,data,revision,schema_version,updated_at,updated_by', {}, token);
      const payload = await response.json();
      if (!response.ok) return sendJson(res, response.status, { error: 'data_read_failed', details: payload });
      if (!payload.length) return sendJson(res, 404, { error: 'data_not_found' });
      return sendJson(res, 200, payload[0]);
    }

    const body = await readJsonBody(req);
    const validationErrors = validateLabData(body?.data);
    if (!body || !isValidUuid(body.requestId) || !Number.isInteger(body.baseRevision) || validationErrors.length > 0) {
      return sendJson(res, 422, { error: 'invalid_change', message: 'requestId、baseRevision 與合法 data 為必要欄位。', details: validationErrors });
    }

    const response = await supabaseFetch('/rest/v1/rpc/apply_lab_state_change', {
      method: 'POST',
      body: JSON.stringify({
        p_base_revision: body.baseRevision,
        p_request_id: body.requestId,
        p_data: body.data
      })
    }, token);
    const payload = await response.json();
    if (!response.ok) {
      const conflict = JSON.stringify(payload).toLowerCase().includes('revision_conflict');
      return sendJson(res, conflict ? 409 : response.status, {
        error: conflict ? 'revision_conflict' : 'data_write_failed',
        details: payload
      });
    }
    return sendJson(res, 200, payload);
  } catch (error) {
    if (error.message === 'supabase_not_configured') {
      return sendJson(res, 503, { error: 'backend_not_configured', message: '尚未設定 Supabase 環境變數。' });
    }
    console.error('data api error', error);
    return sendJson(res, 503, { error: 'service_unavailable', message: '資料服務暫時無法使用。' });
  }
}
