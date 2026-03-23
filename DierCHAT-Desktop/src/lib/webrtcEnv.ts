/**
 * WebRTC / звонки: различия браузер, Capacitor WebView, десктоп.
 */

/** Демонстрация экрана через getDisplayMedia на нативных Android/iOS WebView обычно недоступна (только ПК / Electron). */
export function supportsScreenShare(): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.mediaDevices?.getDisplayMedia !== 'function') {
    return false;
  }
  try {
    const cap = (window as unknown as { Capacitor?: { getPlatform?: () => string } }).Capacitor;
    const p = cap?.getPlatform?.();
    if (p === 'android' || p === 'ios') return false;
  } catch {
    /* no Capacitor */
  }
  return true;
}
