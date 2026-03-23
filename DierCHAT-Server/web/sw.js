/* Service Worker — кэш статики + заглушка push (раздел 13, 16 ТЗ) */
const CACHE = 'dierchat-static-v1';
const ASSETS = ['/', '/index.html', '/icon.png', '/manifest.webmanifest'];

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
  } catch { /* plain text */ }
  event.waitUntil(
    self.registration.showNotification(data.title || 'DierCHAT', {
      body: data.body,
      icon: '/icon.png',
      badge: '/icon.png',
      tag: data.tag || 'dierchat',
    }))
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
        await self.clients.openWindow('/');
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
