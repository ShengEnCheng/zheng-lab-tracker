const LOCAL_STORAGE_KEY = 'ZHENG_LAB_DASHBOARD_DATA_V1';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function createLocalDataStore(storage = globalThis.localStorage) {
  return {
    async get() {
      const raw = storage?.getItem(LOCAL_STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    },
    async save(data) {
      const persisted = clone(data);
      delete persisted.refDate;
      storage?.setItem(LOCAL_STORAGE_KEY, JSON.stringify(persisted));
      return { mode: 'local', data: persisted };
    },
    async exportSnapshot(data) {
      return { mode: 'local', data: clone(data) };
    }
  };
}

export function createApiDataStore({ apiBase = '/api', getToken }) {
  async function request(path, options = {}) {
    const token = await getToken?.();
    const response = await fetch(`${apiBase}${path}`, {
      ...options,
      headers: {
        ...(options.body ? { 'content-type': 'application/json' } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {})
      }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.message || payload.error || `API ${response.status}`);
      error.status = response.status;
      error.payload = payload;
      throw error;
    }
    return payload;
  }

  return {
    async get() { return request('/data'); },
    async save(data, { baseRevision, requestId }) {
      return request('/data', {
        method: 'POST',
        body: JSON.stringify({ data: clone(data), baseRevision, requestId })
      });
    },
    async importData(data, requestId) {
      return request('/import', { method: 'POST', body: JSON.stringify({ data: clone(data), requestId }) });
    },
    async listBackups() { return request('/backups'); },
    async restore(backupId, requestId) {
      return request('/restore', {
        method: 'POST',
        body: JSON.stringify({ backupId, requestId, confirmation: 'RESTORE' })
      });
    }
  };
}

export function makeRequestId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `req-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
