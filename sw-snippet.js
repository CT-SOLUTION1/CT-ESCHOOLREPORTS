// sw.js — change SW_VERSION on EVERY deploy. Browsers re-fetch sw.js each time the app is
// opened; any byte change installs this new worker, which takes over at once and makes
// already-open (and old-version) pages reload themselves.
const SW_VERSION = 'BUILD-2026-10-25-09';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(k => k !== SW_VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim())
));

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  const isPage = req.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('index.html');
  if (isPage) {
    // Network first: opening the app always loads the newest page; cache is offline fallback only.
    event.respondWith(fetch(req, { cache: 'no-store' }).catch(() => caches.match(req)));
    return;
  }
  // ...your existing handling for icons, fonts, etc.
});
