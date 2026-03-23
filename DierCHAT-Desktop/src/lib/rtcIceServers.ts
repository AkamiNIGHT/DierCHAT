/**
 * ==================== БЛОК: ICE / STUN / TURN ДЛЯ WEBRTC ====================
 * Назначение: звонки между разными сетями и NAT требуют TURN (relay). STUN только помогает узнать публичный адрес.
 * Настройка: переменные VITE_* в .env.production и переключатель в localStorage (см. getUseTurnFromStorage).
 * Сервер: поднимите Coturn на VPS, укажите URL, логин и пароль (см. docs/COTURN.example.md).
 */

const LS_TURN = 'dierchat-webrtc-use-turn';

/** Пользовательский переключатель «использовать TURN» (настройки → устройства / звонки). */
export function getUseTurnFromStorage(): boolean {
  const envDefault = import.meta.env.VITE_WEBRTC_USE_TURN !== '0';
  try {
    const v = localStorage.getItem(LS_TURN);
    if (v === '0') return false;
    if (v === '1') return true;
  } catch {
    /* ignore */
  }
  return envDefault;
}

export function setUseTurnInStorage(on: boolean): void {
  try {
    localStorage.setItem(LS_TURN, on ? '1' : '0');
    window.dispatchEvent(new CustomEvent('dierchat-webrtc-prefs-changed'));
  } catch {
    /* ignore */
  }
}

function parseUrls(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Собирает RTCConfiguration для RTCPeerConnection.
 * Вызывать при создании каждого PC (или при смене настроек TURN — пересоздать звонок).
 */
export function buildRtcConfiguration(): RTCConfiguration {
  const iceServers: RTCIceServer[] = [];

  // --- STUN (несколько публичных + кастом из env) ---
  const customStun = parseUrls(import.meta.env.VITE_STUN_URLS as string | undefined);
  const stunList =
    customStun.length > 0
      ? customStun
      : ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'];
  for (const urls of stunList) {
    iceServers.push({ urls });
  }

  // --- TURN (relay через другой город / мобильный интернет) ---
  if (getUseTurnFromStorage()) {
    const turnUrls = parseUrls(import.meta.env.VITE_TURN_URLS as string | undefined);
    const username = (import.meta.env.VITE_TURN_USERNAME as string | undefined)?.trim() || '';
    const credential = (import.meta.env.VITE_TURN_CREDENTIAL as string | undefined)?.trim() || '';
    if (turnUrls.length && username && credential) {
      for (const urls of turnUrls) {
        iceServers.push({ urls, username, credential });
      }
    }
  }

  return {
    iceServers,
    iceCandidatePoolSize: 10,
    bundlePolicy: 'max-bundle',
  };
}
