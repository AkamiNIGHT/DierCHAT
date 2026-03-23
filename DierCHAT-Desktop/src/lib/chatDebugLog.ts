/**
 * ТЗ §48.4 — диагностика чата/сообщений.
 * Включается: localStorage.setItem('DIERCHAT_DEBUG_MESSAGES', '1') и перезагрузка.
 */
const KEY = 'DIERCHAT_DEBUG_MESSAGES';

export function isChatDebugEnabled(): boolean {
  try {
    if (import.meta.env?.VITE_DEBUG_MESSAGES === '1') return true;
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function chatDebug(section: string, data: Record<string, unknown>): void {
  if (!isChatDebugEnabled()) return;
  try {
    // eslint-disable-next-line no-console
    console.info(`[DierCHAT chat] ${section}`, data);
  } catch {
    /* ignore */
  }
}
