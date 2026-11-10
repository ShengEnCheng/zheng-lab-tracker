import {
  methodAllowed, readJsonBody, requireUserToken, sendJson, supabaseFetch, supabaseServerFetch
} from './_supabase.js';

const PROFILE_FIELDS = 'id,email,display_name,member_code,role,active,created_at,updated_at';
const ROLES = new Set(['researcher', 'study_manager', 'admin', 'backup_admin']);

function isUuid(value) {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function adminOnly(res, response, payload) {
  if (!response.ok) {
    const raw = JSON.stringify(payload).toLowerCase();
    return sendJson(res, raw.includes('not_authorized') ? 403 : response.status, {
      error: raw.includes('not_authorized') ? 'forbidden' : 'profile_operation_failed', details: payload
    });
  }
  return null;
}

export default async function handler(req, res) {
  if (!['GET', 'POST', 'PATCH'].includes(req.method)) return methodAllowed(res, ['GET', 'POST', 'PATCH']);
  const token = requireUserToken(req, res);
  if (!token) return;

  try {
    if (req.method === 'GET') {
      const query = new URLSearchParams({ select: PROFILE_FIELDS, order: 'display_name.asc,email.asc' });
      const response = await supabaseFetch(`/rest/v1/lab_profiles?${query}`, {}, token);
      const payload = await response.json().catch(() => ({}));
      const failure = adminOnly(res, response, payload);
      if (failure) return failure;
      return sendJson(res, 200, { profiles: payload });
    }

    const body = await readJsonBody(req);
    if (!body || typeof body.email !== 'string' || !body.email.trim()) {
      return sendJson(res, 422, { error: 'invalid_profile', message: 'email 為必要欄位。' });
    }

    const email = body.email.trim().toLowerCase();
    let userId = body.id;

    // If UUID is not provided, look up or create the Supabase Auth user automatically
    if (!userId || !isUuid(userId)) {
      try {
        const usersRes = await supabaseServerFetch('/auth/v1/admin/users');
        if (usersRes.ok) {
          const usersData = await usersRes.json();
          const existing = (usersData.users || []).find(u => u.email && u.email.toLowerCase() === email);
          if (existing?.id) {
            userId = existing.id;
          }
        }
      } catch (err) {
        console.warn('Failed to query existing auth users:', err);
      }

      if (!userId) {
        try {
          const createRes = await supabaseServerFetch('/auth/v1/admin/users', {
            method: 'POST',
            body: JSON.stringify({
              email,
              password: body.password || 'ZhengLab2026!',
              email_confirm: true
            })
          });
          const created = await createRes.json();
          if (createRes.ok && created?.id) {
            userId = created.id;
          } else {
            return sendJson(res, createRes.status || 400, {
              error: 'user_creation_failed',
              message: created?.message || created?.error_description || '建立 Supabase 帳號失敗。'
            });
          }
        } catch (err) {
          return sendJson(res, 500, { error: 'user_creation_error', message: err.message });
        }
      }
    }

    if (!isUuid(userId)) {
      return sendJson(res, 422, { error: 'invalid_profile', message: '未能取得有效的 Supabase User UUID。' });
    }

    const profile = {
      id: userId,
      email,
      display_name: typeof body.display_name === 'string' ? body.display_name.trim() : null,
      member_code: typeof body.member_code === 'string' ? body.member_code.trim() : '',
      role: body.role || 'researcher',
      active: body.active !== false
    };
    if (!ROLES.has(profile.role)) return sendJson(res, 422, { error: 'invalid_role' });

    const headers = { prefer: 'return=representation,resolution=merge-duplicates' };
    const path = req.method === 'POST' ? '/rest/v1/lab_profiles' : `/rest/v1/lab_profiles?id=eq.${userId}`;
    const response = await supabaseFetch(path, {
      method: req.method === 'POST' ? 'POST' : 'PATCH', headers, body: JSON.stringify(profile)
    }, token);
    const payload = await response.json().catch(() => ({}));
    const failure = adminOnly(res, response, payload);
    if (failure) return failure;
    if (!payload.length) return sendJson(res, 404, { error: 'profile_not_found' });
    return sendJson(res, 200, payload[0]);
  } catch (error) {
    if (error.message === 'supabase_not_configured') return sendJson(res, 503, { error: 'backend_not_configured' });
    console.error('profiles api error', error);
    return sendJson(res, 503, { error: 'service_unavailable' });
  }
}
