/**
 * Вывод звука на выбранное устройство (Chrome/Electron: HTMLMediaElement.setSinkId).
 * На iOS/Safari и части Android может отсутствовать — тогда тихо игнорируем.
 *
 * В Chromium для setSinkId нужен Permissions-Policy: speaker-selection=(self)
 * (см. index.html + vite server.headers) и в Electron — разрешение speaker-selection.
 */

export function supportsAudioOutputSelection(): boolean {
  return typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;
}

function attachSinkRetry(el: HTMLMediaElement, id: string): void {
  const trySet = () => {
    void el.setSinkId(id).catch(() => {
      requestAnimationFrame(() => {
        void el.setSinkId(id).catch(() => {});
      });
    });
  };
  trySet();
  if (el.readyState < 1) {
    el.addEventListener('loadedmetadata', trySet, { once: true });
    el.addEventListener('canplay', trySet, { once: true });
  }
}

export async function applySinkIdToMediaElement(
  el: HTMLMediaElement | null | undefined,
  sinkId: string | undefined | null
): Promise<void> {
  if (!el || !supportsAudioOutputSelection()) return;
  const id = sinkId?.trim() ?? '';
  /** Пустая строка = системное устройство по умолчанию; setSinkId('') часто бросает — не вызываем. */
  if (!id) return;
  try {
    await el.setSinkId(id);
  } catch {
    attachSinkRetry(el, id);
  }
}

type AudioContextWithSink = AudioContext & {
  setSinkId?: (sinkId: string) => Promise<void>;
};

export async function applySinkIdToAudioContext(
  ctx: AudioContext | null | undefined,
  sinkId: string | undefined | null
): Promise<void> {
  if (!ctx) return;
  const c = ctx as AudioContextWithSink;
  if (typeof c.setSinkId !== 'function') return;
  const id = sinkId?.trim() ?? '';
  if (!id) return;
  try {
    await c.setSinkId(id);
  } catch {
    requestAnimationFrame(() => {
      void c.setSinkId?.(id).catch(() => {});
    });
  }
}
