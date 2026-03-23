/* Service Worker — кэш статики + заглушка push (раздел 13, 16 ТЗ).
 * GitHub Pages: скрипт лежит в /<repo>/sw.js — база приложения = каталог скрипта. */
const CACHE = 'dierchat-static-v2';
const SW_PATH = new URL(self.location.href).pathname;
const BASE = SW_PATH.slice(0, SW_PATH.lastIndexOf('/') + 1);
const origin = self.location.origin;
const asset = (name) => `${origin}${BASE}${name}`;

const ASSETS = [
  `${origin}${BASE}`,
  asset('index.html'),
  asset('icon.jpg'),
  asset('manifest.webmanifest'),
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/ws')) return;
  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request))
  );
});

self.addEventListener('push', (event) => {
  let data = { title: 'DierCHAT', body: 'Новое сообщение' };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    /* plain text */
  }
  const iconUrl = asset('icon.jpg');
  event.waitUntil(
    self.registration.showNotification(data.title || 'DierCHAT', {
      body: data.body,
      icon: iconUrl,
      badge: iconUrl,
      tag: data.tag || 'dierchat',
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      for (const c of all) {
        if (c.url && 'focus' in c) {
          await c.focus();
          return;
        }
      }
      if (self.clients.openWindow) {
        await self.clients.openWindow(`${origin}${BASE}`);
      }
    })()
  );
});

/** Background Sync — клиент досылает очередь при срабатывании (ТЗ §16) */
self.addEventListener('sync', (event) => {
  if (event.tag === 'dierchat-outbox') {
    event.waitUntil(
      (async () => {
        const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        for (const c of all) {
          try {
            c.postMessage({ type: 'DIERCHAT_FLUSH_OUTBOX' });
          } catch {
            /* ignore */
          }
        }
      })()
    );
  }
});
