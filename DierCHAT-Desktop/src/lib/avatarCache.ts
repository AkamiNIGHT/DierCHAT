/**
 * ТЗ §35: кэш аватарок в IndexedDB + сброс при смене (WebSocket / свой профиль).
 */
const DB_NAME = 'dierchat-media';
const DB_VER = 1;
const STORE = 'avatars';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onerror = () => reject(req.error);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
  });
}

export async function avatarCacheGet(urlKey: string): Promise<Blob | null> {
  if (typeof indexedDB === 'undefined' || !urlKey) return null;
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const r = tx.objectStore(STORE).get(urlKey);
      r.onsuccess = () => resolve((r.result as { blob?: Blob } | undefined)?.blob ?? null);
      r.onerror = () => reject(r.error);
    });
  } catch {
    return null;
  }
}

export async function avatarCacheSet(urlKey: string, blob: Blob): Promise<void> {
  if (typeof indexedDB === 'undefined' || !urlKey) return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({ key: urlKey, blob, updated: Date.now() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* ignore */
  }
}

/** Удалить записи, у которых ключ содержит подстроку (user id или префикс URL) */
export async function avatarCacheInvalidate(match: string): Promise<void> {
  if (typeof indexedDB === 'undefined' || !match) return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const st = tx.objectStore(STORE);
      const r = st.openCursor();
      r.onsuccess = () => {
        const cur = r.result;
        if (!cur) {
          resolve();
          return;
        }
        const key = String(cur.key ?? '');
        if (key.includes(match)) cur.delete();
        cur.continue();
      };
      r.onerror = () => reject(r.error);
    });
  } catch {
    /* ignore */
  }
}

export function dispatchAvatarCacheBust(detail: { url?: string; userId?: string }): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('dierchat:avatar_cache_bust', { detail }));
}
