/** Стартовая страница новой вкладки и поиск по умолчанию */
export const DEFAULT_NEW_TAB_URL = 'https://www.google.com/';

const GOOGLE_SEARCH = 'https://www.google.com/search';

/**
 * Адресная строка: URL или поисковый запрос → итоговый https-адрес.
 * Поисковая система по умолчанию — Google.
 */
export function resolveAddressBarInput(raw: string): string {
  const t = raw.trim();
  if (!t) return '';

  if (/^https?:\/\//i.test(t)) return t;

  if (/\s/.test(t)) {
    return `${GOOGLE_SEARCH}?q=${encodeURIComponent(t)}`;
  }

  if (/^(localhost|127\.0\.0\.1)(:\d+)?(\/.*)?$/i.test(t)) {
    return `http://${t}`;
  }

  if (/^\d{1,3}(\.\d{1,3}){3}(:\d+)?(\/.*)?$/i.test(t)) {
    return `http://${t}`;
  }

  if (/^[a-zA-Z0-9]([a-zA-Z0-9-]*\.)+[a-zA-Z]{2,}([\/\?#].*)?$/.test(t)) {
    return `https://${t}`;
  }

  return `${GOOGLE_SEARCH}?q=${encodeURIComponent(t)}`;
}
