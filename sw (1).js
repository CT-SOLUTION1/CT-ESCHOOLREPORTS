// sw.js — change SW_VERSION on EVERY deploy, together with BUILD_ID at the top of index.html
// (they must be the same string). Browsers re-fetch sw.js each time the app is opened; any byte
// change installs this new worker, which takes over at once and makes already-open (and
// old-version) pages reload themselves.
const SW_VERSION = 'BUILD-2026-10-29-18';

// Small static files kept for offline use. Each one is added separately so a missing file
// can never make the whole install fail.
const PRECACHE = ['./manifest.json', './icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SW_VERSION)
      .then((cache) => Promise.all(PRECACHE.map((u) => cache.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => e.waitUntil(
  caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== SW_VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim())
));

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;                 // never touch saves / uploads

  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const isPage = req.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('index.html');

  if (isPage && sameOrigin) {
    // Network first: opening the app always loads the newest page; cache is offline fallback only.
    // (This also serves the page's own BUILD_ID update check, which must never come from a cache.)
    event.respondWith(
      fetch(req, { cache: 'no-store' })
        .then((res) => {
          if (res && res.ok && req.mode === 'navigate') {
            const copy = res.clone();
            caches.open(SW_VERSION).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html') || caches.match('./')))
    );
    return;
  }

  // Own static files (icons, manifest) and the cdnjs libraries: serve from cache instantly,
  // refresh the cached copy in the background.
  if (sameOrigin || url.hostname === 'cdnjs.cloudflare.com') {
    event.respondWith(
      caches.open(SW_VERSION).then((cache) =>
        cache.match(req).then((hit) => {
          const refresh = fetch(req)
            .then((res) => {
              if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone()).catch(() => {});
              return res;
            })
            .catch(() => hit);
          return hit || refresh;
        })
      )
    );
    return;
  }

  // Everything else (Firebase / Google APIs, gstatic, etc.) goes straight to the network, uncached.
});
