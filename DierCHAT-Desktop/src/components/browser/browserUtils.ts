/** Favicon через публичный сервис (cross-origin страницы недоступны из родителя) */
export function faviconUrlForPageUrl(url: string): string {
  try {
    const u = new URL(url);
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(u.hostname)}&sz=32`;
  } catch {
    return '';
  }
}

export function shortTitleFromUrl(url: string, max = 22): string {
  try {
    const u = new URL(url);
    const p = u.pathname === '/' ? '' : u.pathname;
    const s = u.hostname.replace(/^www\./, '') + p;
    return s.length > max ? `${s.slice(0, max)}…` : s;
  } catch {
    return url.slice(0, max);
  }
}
