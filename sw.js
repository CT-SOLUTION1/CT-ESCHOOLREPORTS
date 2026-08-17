/* ---------------------------------------------------------------------------
   Service worker for CT-E SOLUTIONS.

   HOW THE AUTO-UPDATE FLOW WORKS (paired with the BUILD_ID poller in index.html):

   1. Every deploy, bump CACHE_NAME below (any change to THIS FILE's bytes is what
      makes the browser notice a new service worker exists at all — browsers check
      sw.js for changes on every page load automatically, no manual step needed
      beyond bumping this string).
   2. self.skipWaiting() on install means the new worker doesn't sit "waiting" for
      every open tab to be closed first — it activates immediately.
   3. clients.claim() on activate means it takes control of already-open tabs
      right away, instead of only affecting the next fresh page load.
   4. The fetch handler uses NETWORK-FIRST for navigations/HTML, so a tab that
      reloads (see the BUILD_ID poller in index.html) always gets the latest
      deployed HTML when online, falling back to the cache only when offline.

   You should still bump CACHE_NAME on every deploy — it's what actually triggers
   browsers to install this file as a new version in the first place.
--------------------------------------------------------------------------- */
const CACHE_NAME = 'cte-solutions-v1'; // <-- bump this (e.g. -v2, -v3...) on every deploy
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => {})
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Drop every cache from a previous CACHE_NAME so nothing stale lingers.
      const names = await caches.keys();
      await Promise.all(names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const isNavigation = req.mode === 'navigate' ||
    (req.headers.get('accept') || '').includes('text/html');

  if (isNavigation) {
    // Network-first for the app shell: always try to get the freshest deployed
    // HTML when online; only fall back to the cached copy if the network fails
    // (offline), so an update is never masked by a stale cached page.
    event.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put('./index.html', copy)).catch(() => {});
        return res;
      }).catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Everything else (icons, manifest, etc.): cache-first, network fallback.
  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req).catch(() => cached))
  );
});
