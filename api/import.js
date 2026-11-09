import { methodAllowed, readJsonBody, requireUserToken, sendJson, supabaseFetch } from './_supabase.js';
import { validateLabData } from '../src/lib/schema.js';

function isUuid(value) {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return methodAllowed(res, ['POST']);
  const token = requireUserToken(req, res);
  if (!token) return;
  const body = await readJsonBody(req);
  const validationErrors = validateLabData(body?.data);
  if (!isUuid(body?.requestId) || validationErrors.length > 0) {
    return sendJson(res, 422, { error: 'invalid_import', message: '需要 requestId 與合法研究資料。', details: validationErrors });
  }
  try {
    const response = await supabaseFetch('/rest/v1/rpc/import_lab_state', {
      method: 'POST',
      body: JSON.stringify({ p_data: body.data, p_request_id: body.requestId })
    }, token);
    const payload = await response.json();
    if (!response.ok) {
      const forbidden = JSON.stringify(payload).toLowerCase().includes('not_authorized');
      return sendJson(res, forbidden ? 403 : response.status, { error: forbidden ? 'forbidden' : 'import_failed', details: payload });
    }
    return sendJson(res, 200, payload);
  } catch (error) {
    if (error.message === 'supabase_not_configured') return sendJson(res, 503, { error: 'backend_not_configured' });
    console.error('import api error', error);
    return sendJson(res, 503, { error: 'service_unavailable' });
  }
}
