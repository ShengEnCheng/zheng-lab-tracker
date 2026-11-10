import {
  methodAllowed, requireUserToken, sendJson, supabaseFetch
} from './_supabase.js';

const PROFILE_FIELDS = 'id,email,display_name,member_code,role,active,created_at,updated_at';

async function getAuthUser(token) {
  const response = await supabaseFetch('/auth/v1/user', {}, token);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.id) return null;
  return payload;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return methodAllowed(res, ['GET']);
  const token = requireUserToken(req, res);
  if (!token) return;

  try {
    const user = await getAuthUser(token);
    if (!user) return sendJson(res, 401, { error: 'invalid_token' });
    const query = new URLSearchParams({
      select: PROFILE_FIELDS,
      id: `eq.${user.id}`,
      limit: '1'
    });
    const response = await supabaseFetch(`/rest/v1/lab_profiles?${query}`, {}, token);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return sendJson(res, response.status, { error: 'profile_read_failed', details: payload });
    if (!payload.length) return sendJson(res, 404, { error: 'profile_not_found' });
    return sendJson(res, 200, payload[0]);
  } catch (error) {
    if (error.message === 'supabase_not_configured') {
      return sendJson(res, 503, { error: 'backend_not_configured' });
    }
    console.error('profile api error', error);
    return sendJson(res, 503, { error: 'service_unavailable' });
  }
}
