export function createSupabaseAuth({ supabaseUrl, anonKey, storage = globalThis.localStorage }) {
  const sessionKey = 'ZHENG_LAB_AUTH_SESSION';
  const endpoint = `${String(supabaseUrl || '').replace(/\/$/, '')}/auth/v1`;

  async function request(path, options = {}) {
    const response = await fetch(`${endpoint}${path}`, {
      ...options,
      headers: {
        apikey: anonKey,
        'content-type': 'application/json',
        ...(options.headers || {})
      }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.error_description || payload.msg || payload.message || `Auth ${response.status}`);
      error.status = response.status;
      error.payload = payload;
      throw error;
    }
    return payload;
  }

  return {
    async signIn(email, password) {
      const session = await request('/token?grant_type=password', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });
      storage?.setItem(sessionKey, JSON.stringify(session));
      return session;
    },
    async signUp(email, password) {
      return request('/signup', { method: 'POST', body: JSON.stringify({ email, password }) });
    },
    async refresh(refreshToken) {
      const session = await request('/token?grant_type=refresh_token', {
        method: 'POST', body: JSON.stringify({ refresh_token: refreshToken })
      });
      storage?.setItem(sessionKey, JSON.stringify(session));
      return session;
    },
    getSession() {
      const raw = storage?.getItem(sessionKey);
      return raw ? JSON.parse(raw) : null;
    },
    getAccessToken() {
      return this.getSession()?.access_token || '';
    },
    signOut() {
      storage?.removeItem(sessionKey);
    }
  };
}
