/* AgriForecast service worker — PWA baseline (FE-2).
 * Minimal app-shell cache so the installed app opens offline. Full offline UX
 * (staleness banner, cached last-fetched data, API strategy) is FE-9 — this SW
 * deliberately does NOT cache API responses (no stale prices shown as fresh).
 */
const CACHE = 'agriforecast-shell-v1';
const APP_SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icons/icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Never serve API calls from cache in R1 — honesty over offline convenience.
  if (url.pathname.startsWith('/api/')) return;

  // App shell: network-first for navigations, cache fallback when offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('/index.html', copy));
          return res;
        })
        .catch(() => caches.match('/index.html').then((r) => r ?? Response.error())),
    );
    return;
  }

  // Static assets: cache-first.
  event.respondWith(
    caches.match(request).then((cached) => cached ?? fetch(request)),
  );
});
