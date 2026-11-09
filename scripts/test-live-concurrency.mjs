const apiBase = (process.env.ZHENG_API_BASE || '').replace(/\/$/, '');
const supabaseUrl = process.env.SUPABASE_URL || '';
const anonKey = process.env.SUPABASE_ANON_KEY || '';
const email1 = process.env.DEMO_AUTH_EMAIL || '';
const password1 = process.env.DEMO_AUTH_PASSWORD || '';
const email2 = process.env.DEMO_AUTH_EMAIL_2 || '';
const password2 = process.env.DEMO_AUTH_PASSWORD_2 || '';
if (!apiBase || !supabaseUrl || !anonKey || !email1 || !password1 || !email2 || !password2) {
  throw new Error('需要 ZHENG_API_BASE、Supabase URL/anon key，以及兩組 DEMO_AUTH_EMAIL(_2)/DEMO_AUTH_PASSWORD(_2)。');
}
async function login(email, password) {
  const r = await fetch(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: anonKey, 'content-type': 'application/json' }, body: JSON.stringify({ email, password })
  });
  const p = await r.json();
  if (!r.ok || !p.access_token) throw new Error(`登入失敗 ${email}: HTTP ${r.status}`);
  return p.access_token;
}
async function api(path, token, options = {}) {
  const r = await fetch(`${apiBase}${path}`, { ...options, headers: { ...(options.body ? { 'content-type': 'application/json' } : {}), authorization: `Bearer ${token}`, ...(options.headers || {}) } });
  const p = await r.json().catch(() => ({}));
  return { status: r.status, payload: p };
}
const [token1, token2] = await Promise.all([login(email1, password1), login(email2, password2)]);
const [a, b] = await Promise.all([api('/data', token1), api('/data', token2)]);
if (a.status !== 200 || b.status !== 200) throw new Error(`兩帳號讀取失敗：${a.status}/${b.status}`);
if (a.payload.revision !== b.payload.revision) throw new Error(`初始 revision 不一致：${a.payload.revision}/${b.payload.revision}`);
const baseRevision = a.payload.revision;
const dataA = structuredClone(a.payload.data);
dataA.__concurrencyTest = { actor: 'A', at: new Date().toISOString() };
const dataB = structuredClone(b.payload.data);
dataB.__concurrencyTest = { actor: 'B', at: new Date().toISOString() };
const [writeA, writeB] = await Promise.all([
  api('/data', token1, { method: 'POST', body: JSON.stringify({ baseRevision, requestId: crypto.randomUUID(), data: dataA }) }),
  api('/data', token2, { method: 'POST', body: JSON.stringify({ baseRevision, requestId: crypto.randomUUID(), data: dataB }) })
]);
const statuses = [writeA.status, writeB.status].sort((x, y) => x - y);
if (statuses[0] !== 200 || statuses[1] !== 409) throw new Error(`衝突驗收失敗：回應 ${writeA.status}/${writeB.status}，預期 200/409`);
console.log('✓ 兩帳號同 revision 同時寫入：一方成功、一方收到 409，沒有靜默覆蓋');
