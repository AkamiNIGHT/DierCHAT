/**
 * ==================== БЛОК: НАСТРОЙКИ УСТРОЙСТВ В INDEXEDDB ====================
 * Назначение: дублировать камеру/микрофон/динамик в IndexedDB (надёжнее localStorage в WebView/Capacitor).
 * Синхронизация: модуль DeviceSettingsPersistence подписывается на store и вызывает save при изменениях.
 */

const DB_NAME = 'dierchat-settings';
const DB_VER = 1;
const STORE = 'deviceSettings';

export type StoredDevicePrefs = {
  cameraId: string;
  microphoneId: string;
  speakerId: string;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
  });
}

const ROW_ID = 'default';

/** Читает сохранённые id устройств (или null). */
export async function loadDevicePrefsFromIDB(): Promise<StoredDevicePrefs | null> {
  try {
    if (typeof indexedDB === 'undefined') return null;
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const st = tx.objectStore(STORE);
      const g = st.get(ROW_ID);
      g.onerror = () => reject(g.error);
      g.onsuccess = () => {
        const v = g.result as { id: string; prefs: StoredDevicePrefs } | undefined;
        resolve(v?.prefs ?? null);
      };
    });
  } catch {
    return null;
  }
}

/** Сохраняет настройки устройств (вызывать при каждом изменении в store). */
export async function saveDevicePrefsToIDB(prefs: StoredDevicePrefs): Promise<void> {
  try {
    if (typeof indexedDB === 'undefined') return Promise.resolve();
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.objectStore(STORE).put({ id: ROW_ID, prefs });
    });
  } catch {
    /* игнор — не блокируем UI */
    return Promise.resolve();
  }
}

/** Очистка (кнопка «Сбросить настройки устройств»). */
export async function clearDevicePrefsIDB(): Promise<void> {
  try {
    if (typeof indexedDB === 'undefined') return Promise.resolve();
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.objectStore(STORE).delete(ROW_ID);
    });
  } catch {
    return Promise.resolve();
  }
}
