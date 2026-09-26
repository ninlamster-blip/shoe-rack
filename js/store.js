// Everything the app keeps lives on this phone.
//
// Pairs carry a photo, so they go in IndexedDB, which can hold megabytes.
// Small settings (family, shelf order, API key) go in localStorage under one
// prefix. Both can be unavailable — a private window, blocked site data — so
// every read falls back to a sensible empty value instead of breaking the page.

const PREFIX = 'shoerack/v1/';
const DB_NAME = 'shoe-rack';
const DB_VERSION = 1;

export const settings = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  },
  remove(key) {
    try {
      localStorage.removeItem(PREFIX + key);
    } catch {
      /* nothing to remove */
    }
  },
};

let dbPromise;

function db() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const store = req.result.createObjectStore('pairs', { keyPath: 'id' });
      store.createIndex('type', 'type');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function tx(mode, fn) {
  const conn = await db();
  return new Promise((resolve, reject) => {
    const t = conn.transaction('pairs', mode);
    const result = fn(t.objectStore('pairs'));
    t.oncomplete = () => resolve(result?.result ?? result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export const pairs = {
  async all() {
    try {
      const list = await tx('readonly', (s) => s.getAll());
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  },
  put(pair) {
    return tx('readwrite', (s) => s.put(pair));
  },
  remove(id) {
    return tx('readwrite', (s) => s.delete(id));
  },
  clear() {
    return tx('readwrite', (s) => s.clear());
  },
};

export function newId() {
  return crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
