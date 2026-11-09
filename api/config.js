import { sendJson, supabaseConfig } from './_supabase.js';

export default function handler(req, res) {
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'method_not_allowed' });
  const config = supabaseConfig(false);
  if (!config) return sendJson(res, 503, { error: 'backend_not_configured' });
  return sendJson(res, 200, { supabaseUrl: config.url, anonKey: config.key });
}
