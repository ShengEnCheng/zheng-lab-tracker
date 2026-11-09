const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' };

export function sendJson(res, status, body) {
  res.status(status).setHeader('content-type', JSON_HEADERS['content-type']);
  return res.end(JSON.stringify(body));
}

export function methodAllowed(res, methods) {
  res.setHeader('allow', methods.join(', '));
  sendJson(res, 405, { error: 'method_not_allowed', allowed: methods });
}

export function getBearerToken(req) {
  const value = req.headers.authorization || '';
  return value.startsWith('Bearer ') ? value.slice(7).trim() : '';
}

export function requireUserToken(req, res) {
  const token = getBearerToken(req);
  if (!token) {
    sendJson(res, 401, { error: 'unauthorized', message: '需要登入後的 Bearer token。' });
    return null;
  }
  return token;
}

export function supabaseConfig(serverOnly = false) {
  const url = process.env.SUPABASE_URL;
  const key = serverOnly ? process.env.SUPABASE_SERVICE_ROLE_KEY : process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return { url: url.replace(/\/$/, ''), key };
}

export async function supabaseFetch(path, options = {}, token = '') {
  const config = supabaseConfig(false);
  if (!config) throw new Error('supabase_not_configured');
  const headers = {
    apikey: config.key,
    authorization: `Bearer ${token || config.key}`,
    'content-type': 'application/json',
    ...(options.headers || {})
  };
  return fetch(`${config.url}${path}`, { ...options, headers });
}

export async function supabaseServerFetch(path, options = {}) {
  const config = supabaseConfig(true);
  if (!config) throw new Error('supabase_not_configured');
  const headers = {
    apikey: config.key,
    authorization: `Bearer ${config.key}`,
    'content-type': 'application/json',
    ...(options.headers || {})
  };
  return fetch(`${config.url}${path}`, { ...options, headers });
}

export async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  let raw = '';
  for await (const chunk of req) raw += chunk;
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}
