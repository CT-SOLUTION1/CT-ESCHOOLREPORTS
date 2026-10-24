// sw.js — change SW_VERSION on EVERY deploy. Browsers re-fetch sw.js each time the app is
// opened; any byte change installs this new worker, which takes over at once and makes
// already-open (and old-version) pages reload themselves.
const SW_VERSION = 'BUILD-2026-10-24-84';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(
  Promise.all([
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== SW_VERSION).map(k => caches.delete(k)))),
    // Starts the page request while the worker is still waking up, so it is not delayed by it.
    self.registration.navigationPreload ? self.registration.navigationPreload.enable() : null
  ]).then(() => self.clients.claim())
));

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const isPage = req.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('index.html');
  if (isPage) {
    // Cache first, refresh behind: the saved page opens instantly (no network wait), while a
    // fresh copy is fetched in the background and stored for the next open. The app's own
    // new-build check (updateOnNavigate) still reloads into the newest version when one exists.
    event.respondWith((async () => {
      const cache = await caches.open(SW_VERSION);
      const cached = await cache.match(req, { ignoreSearch: true });
      const refresh = (async () => {
        try {
          const res = (await event.preloadResponse) || await fetch(req, { cache: 'no-store' });
          if (res && res.ok) await cache.put(req, res.clone());
          return res;
        } catch (e) { return null; }
      })();
      if (cached) { event.waitUntil(refresh); return cached; }   // instant open
      const fresh = await refresh;                               // very first open / new deploy
      return fresh || Response.error();
    })());
    return;
  }
  // ...your existing handling for icons, fonts, etc.
});
