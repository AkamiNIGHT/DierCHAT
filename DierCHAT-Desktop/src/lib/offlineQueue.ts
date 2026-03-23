/** Очередь сообщений при офлайне (ТЗ §16) */

const KEY = 'dierchat-offline-queue';

export type QueuedSend = {
  chatId: string;
  type: number;
  text: string;
  replyToId?: string;
  silent?: boolean;
  ts: number;
};

export function loadQueue(): QueuedSend[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const q = JSON.parse(raw) as QueuedSend[];
    return Array.isArray(q) ? q : [];
  } catch {
    return [];
  }
}

function saveQueue(q: QueuedSend[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(q));
  } catch {
    /* quota */
  }
}

export function enqueueOfflineMessage(item: Omit<QueuedSend, 'ts'>): void {
  const q = loadQueue();
  q.push({ ...item, ts: Date.now() });
  saveQueue(q);
}

export function clearQueue(): void {
  localStorage.removeItem(KEY);
}

/** Отправить очередь по одному; при ошибке оставшиеся возвращаются в storage */
export async function flushOfflineQueue(
  send: (item: Omit<QueuedSend, 'ts'>) => Promise<void>
): Promise<void> {
  let q = loadQueue();
  if (!q.length) return;
  clearQueue();
  const failed: QueuedSend[] = [];
  for (const item of q) {
    const { ts: _t, ...rest } = item;
    try {
      await send(rest);
    } catch {
      failed.push(item);
      break;
    }
  }
  if (failed.length) {
    const rest = loadQueue();
    saveQueue([...failed, ...rest]);
  }
}

/** Запрос фоновой синхронизации (если SW и API доступны) */
export function requestOutboxSync(): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker.ready
    .then((reg) => {
      try {
        return reg.sync?.register('dierchat-outbox');
      } catch {
        /* SyncManager не поддерживается */
      }
    })
    .catch(() => {});
}
