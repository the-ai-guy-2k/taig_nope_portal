'use strict';
/* Giggit service worker.
   Update fix (Tee's note — the PWA "never updates" lag): the app shell is
   cached, but the worker checks for a new version on every load and
   every 30 minutes, and the page shows an "Update now" banner the moment
   a new worker is waiting. Tapping it runs skipWaiting + clients.claim,
   so the new version takes over immediately instead of waiting for all
   tabs to close. API calls are network-first with a cache fallback so
   the gig list still reads offline. */

const CACHE = 'giggit-v2';
const SHELL = [
  './',
  './index.html',
  './giggit.css',
  './giggit.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

/* The page asks for this when the user taps "Update now". */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET') return;
  /* API: network first, fall back to the last cached response. */
  if (url.pathname.indexOf('/api/giggit/') === 0) {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy));
          return res;
        })
        .catch(() => caches.match(event.request)),
    );
    return;
  }
  /* App shell + icons: cache first, refresh in the background. */
  if (url.pathname.indexOf('/giggit/') === 0) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        const network = fetch(event.request)
          .then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(event.request, copy));
            return res;
          })
          .catch(() => cached);
        return cached || network;
      }),
    );
  }
});

/* Push notifications. */
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (err) {
    data = { body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'Giggit';
  const options = {
    body: data.body || 'Something new on Giggit.',
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png',
    data: { url: data.url || './' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || './';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
