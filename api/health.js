import { sendJson, supabaseConfig } from './_supabase.js';

export default function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('allow', 'GET');
    return sendJson(res, 405, { error: 'method_not_allowed' });
  }
  return sendJson(res, 200, {
    service: 'zheng-lab-api',
    status: 'ok',
    environment: process.env.VERCEL_ENV || 'local',
    backendConfigured: Boolean(supabaseConfig(false)),
    serverTime: new Date().toISOString()
  });
}
