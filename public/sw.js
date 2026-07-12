/* AgriForecast service worker — FE-9 (app-shell + last-data offline caching).
 *
 * TWO caches:
 *   SHELL_CACHE — the built app shell (index.html + hashed JS/CSS + manifest +
 *     icon). Precached on install from a build-time-injected manifest so the app
 *     opens fully offline after the first visit. Static assets are hashed and
 *     immutable, so a cache-first read is always correct.
 *   DATA_CACHE  — last-known GET /api responses. Strategy is NETWORK-FIRST with
 *     cache fallback (NOT plain stale-while-revalidate): a farmer sees FRESH data
 *     whenever reachable, and the saved copy ONLY when the network is down. The
 *     fallback response is stamped X-SW-Cache/X-SW-Cached-At so the app can show
 *     an honest "showing saved prices from <date>" banner. Successful responses
 *     are written through (stamped with the fetch time) for next time.
 *
 * Bump CACHE_VERSION to invalidate old caches on deploy.
 */
const CACHE_VERSION = 'v2';
const SHELL_CACHE = `agriforecast-shell-${CACHE_VERSION}`;
const DATA_CACHE = `agriforecast-data-${CACHE_VERSION}`;

// Build-time injected by vite.config.ts (agri-sw-precache). Fallback list keeps a
// dev/un-injected SW functional (shell entries only, no hashed assets).
const PRECACHE = /*__PRECACHE_MANIFEST__*/ [];
const FALLBACK_SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icons/icon.svg'];

self.addEventListener('install', (event) => {
  const urls = PRECACHE.length ? PRECACHE : FALLBACK_SHELL;
  event.waitUntil(
    caches.open(SHELL_CACHE).then((c) => c.addAll(urls).catch(() => undefined)),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  const keep = new Set([SHELL_CACHE, DATA_CACHE]);
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !keep.has(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/** Clone a response and stamp cache-provenance headers the app reads. */
async function stamp(response, cachedAt) {
  const headers = new Headers(response.headers);
  headers.set('X-SW-Cache', 'hit');
  headers.set('X-SW-Cached-At', cachedAt || new Date().toISOString());
  const body = await response.blob();
  return new Response(body, { status: response.status, statusText: response.statusText, headers });
}

/** NETWORK-FIRST for API: fresh when online, stamped cache when unreachable. */
async function apiStrategy(request) {
  const cache = await caches.open(DATA_CACHE);
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.ok) {
      // Write through, stamped with the fetch time, for a future offline read.
      const stamped = await stamp(fresh.clone(), new Date().toISOString());
      cache.put(request, stamped);
    }
    return fresh; // unstamped -> app treats it as fresh
  } catch {
    const cached = await cache.match(request);
    if (cached) {
      const cachedAt = cached.headers.get('X-SW-Cached-At');
      return stamp(cached, cachedAt); // stamped -> app shows the staleness banner
    }
    return Response.error();
  }
}

// Logout hook (FE-17): the app posts { type: 'CLEAR_DATA_CACHE' } on sign-out so
// one farmer's cached authenticated /api responses (network-first fallback copies)
// cannot leak to the next person who signs in on the same device. Only the DATA
// cache is dropped; the public app shell stays precached for offline launch.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'CLEAR_DATA_CACHE') {
    event.waitUntil(caches.delete(DATA_CACHE));
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // API: honest network-first with a stamped offline fallback.
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(apiStrategy(request));
    return;
  }

  // App shell navigations: network-first, fall back to the cached index.html.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((c) => c.put('/index.html', copy));
          return res;
        })
        .catch(() =>
          caches.match('/index.html', { cacheName: SHELL_CACHE }).then((r) => r ?? caches.match('/index.html')).then((r) => r ?? Response.error()),
        ),
    );
    return;
  }

  // Static assets (hashed JS/CSS, icons, fonts): cache-first, then network + fill.
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ??
        fetch(request).then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(SHELL_CACHE).then((c) => c.put(request, copy));
          }
          return res;
        }),
    ),
  );
});
