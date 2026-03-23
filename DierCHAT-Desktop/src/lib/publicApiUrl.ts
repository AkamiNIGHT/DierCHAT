/**
 * Fallback, если нет VITE_API_BASE_URL в .env.production при сборке.
 * Держите в синхроне с DierCHAT-Desktop/.env.production
 */
export const PRODUCTION_API_BASE_DEFAULT = 'http://31.148.99.40:9000';

function fallbackApiBaseNoEnv(): string {
  if (import.meta.env.PROD) {
    return PRODUCTION_API_BASE_DEFAULT;
  }
  return 'http://localhost:9000';
}

/**
 * Публичный базовый URL API (без завершающего /).
 * - Продакшен в браузере: тот же origin, что и сайт (например https://dier-chat.ru)
 * - Vite dev (:5173): пустая строка — запросы идут через прокси
 * - Electron / APK (сборка PROD): VITE_API_BASE_URL или продакшен-хост по умолчанию
 * - Локальная сборка DEV: localhost:9000
 */
export function getPublicApiBaseUrl(): string {
  if (typeof window === 'undefined') {
    return '';
  }
  const electron = (window as unknown as { dierchat?: unknown }).dierchat;
  const fromEnv = (import.meta.env?.VITE_API_BASE_URL as string | undefined)?.trim() || '';

  if (electron) {
    return fromEnv || fallbackApiBaseNoEnv();
  }
  if (window.location.port === '5173') {
    return '';
  }
  const host = window.location.hostname;
  if (host !== 'localhost' && host !== '127.0.0.1') {
    return window.location.origin;
  }
  /* Capacitor / file / preview на localhost — в PROD без VITE_* используем удалённый API */
  return fromEnv || fallbackApiBaseNoEnv();
}

/**
 * База HTTP(S) для сборки URL WebSocket (`/ws?token=...` в `api/ws.ts`).
 * На проде REST и WS часто на разных портах или за разными nginx location — тогда:
 * - `VITE_WS_PORT=8081` — тот же хост, что и `VITE_API_BASE_URL`, другой порт;
 * - или полный `VITE_WS_URL=ws://host:8081` / `wss://...` / `http://...`.
 */
export function getWebSocketHttpBaseUrl(): string {
  if (typeof window === 'undefined') {
    return '';
  }
  const raw = (import.meta.env?.VITE_WS_URL as string | undefined)?.trim();
  if (raw) {
    if (/^wss:\/\//i.test(raw)) return raw.replace(/^wss:\/\//i, 'https://').replace(/\/$/, '');
    if (/^ws:\/\//i.test(raw)) return raw.replace(/^ws:\/\//i, 'http://').replace(/\/$/, '');
    return raw.replace(/\/$/, '');
  }
  const wsPort = (import.meta.env?.VITE_WS_PORT as string | undefined)?.trim();
  const api = getPublicApiBaseUrl().replace(/\/$/, '');
  if (wsPort && api) {
    try {
      const u = new URL(api.includes('://') ? api : `http://${api}`);
      u.port = wsPort;
      return u.origin;
    } catch {
      /* fall through */
    }
  }
  return getPublicApiBaseUrl();
}

/** Известные продакшен-хосты (HTTP/HTTPS, www), с которых медиа отдаётся через тот же nginx */
const LEGACY_MEDIA_HOSTS = new Set(['dier-chat.ru', 'www.dier-chat.ru']);

function apiBaseIsRemote(apiOrigin: string): boolean {
  if (!apiOrigin) return false;
  try {
    const h = new URL(apiOrigin).hostname;
    return h !== 'localhost' && h !== '127.0.0.1';
  } catch {
    return false;
  }
}

/**
 * Приводит URL медиа к виду, удобному для текущей страницы.
 * Важно: при `VITE_API_BASE_URL` на **удалённый** сервер нельзя превращать URL в `/media/...` —
 * иначе запрос пойдёт на Vite (`localhost:5173`) и прокси на `localhost:9000` → 500 и пустые картинки.
 */
export function normalizeMediaUrl(raw: string): string {
  if (!raw?.trim()) return raw;
  let r = raw.trim();
  if (typeof window === 'undefined') return r;

  const apiOrigin = getPublicApiBaseUrl().replace(/\/$/, '');
  const remoteApi = apiBaseIsRemote(apiOrigin);
  const electron = !!(window as unknown as { dierchat?: unknown }).dierchat;

  // Относительные пути медиа: с известной базой API — всегда абсолютный URL на бэкенд
  if (r.startsWith('/media/') || r.startsWith('/media?')) {
    if (apiOrigin) return apiOrigin + r;
    return r;
  }

  try {
    const u = new URL(r, window.location.origin);
    if (u.origin === window.location.origin) {
      return u.pathname + u.search;
    }
    if (LEGACY_MEDIA_HOSTS.has(u.hostname.toLowerCase())) {
      return u.pathname + u.search;
    }
    // Удалённый API: не срезаем до относительного пути — иначе сломается загрузка
    if (remoteApi && apiOrigin) {
      const bu = new URL(apiOrigin);
      if (u.origin === bu.origin) {
        return u.toString();
      }
    }
    if (u.hostname === '31.148.99.40' && (u.port === '9000' || u.port === '')) {
      if (remoteApi) {
        return u.toString();
      }
      return u.pathname + u.search;
    }
  } catch {
    /* ignore */
  }

  if (r.includes('localhost:9000')) {
    const loc = window.location;
    if (!remoteApi && (loc.port === '5173' || electron)) {
      r = r.replace(/https?:\/\/localhost:9000/g, '');
    }
  }
  if (r.includes('31.148.99.40:9000')) {
    if (!remoteApi) {
      r = r.replace(/https?:\/\/31\.148\.99\.40:9000/g, '');
    }
  }
  return r;
}
