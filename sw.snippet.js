/* CT-E SOLUTIONS — service worker (matches manifest.json: scope "./", start_url "./index.html").
   Registered by index.html as './sw.snippet.js'. The page's own BUILD_ID polling handles version detection;
   this worker only keeps the app shell available offline and takes control immediately on deploy.

   - Pages (navigations): network first, saved copy of index.html if offline.
   - Own static files (icons, manifest): serve saved copy at once, refresh it in the background.
   - Libraries from public CDNs: saved after first use, so reports/PDF tools still work offline.
   - Everything else (database / API / uploads, and every non-GET request): never touched. */

const SHELL_CACHE = 'cte-snippet-shell-v1';
const LIB_CACHE   = 'cte-snippet-libs-v1';
const SHELL_FILES = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];
const LIB_HOSTS   = ['cdnjs.cloudflare.com', 'cdn.jsdelivr.net', 'unpkg.com'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      // one missing file (e.g. an icon not uploaded yet) must not stop the worker installing
      .then((cache) => Promise.allSettled(SHELL_FILES.map((f) => cache.add(new Request(f, { cache: 'reload' })))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  const keep = new Set([SHELL_CACHE, LIB_CACHE]);
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((n) => !keep.has(n)).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (req.mode === 'navigate') {                         // opening / refreshing the app
    event.respondWith(pageFromNetwork(req));
  } else if (url.origin === self.location.origin) {      // icons, manifest, other own files
    event.respondWith(ownFile(req));
  } else if (LIB_HOSTS.includes(url.hostname)) {         // public CDN libraries
    event.respondWith(libFile(req));
  }
  // anything else: no respondWith -> goes straight to the network
});

async function pageFromNetwork(req) {
  try {
    const fresh = await fetch(req, { cache: 'no-store' });
    if (fresh && fresh.ok) {
      const cache = await caches.open(SHELL_CACHE);
      cache.put('./index.html', fresh.clone());
    }
    return fresh;
  } catch (err) {
    const cache = await caches.open(SHELL_CACHE);
    return (await cache.match('./index.html')) || (await cache.match('./')) ||
      new Response('You are offline and the app has not been saved on this device yet.',
                   { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
}

async function ownFile(req) {
  const cache = await caches.open(SHELL_CACHE);
  const saved = await cache.match(req);
  const refresh = fetch(req).then((res) => { if (res && res.ok) cache.put(req, res.clone()); return res; });
  if (saved) { refresh.catch(() => {}); return saved; }
  return refresh.catch(() => new Response('', { status: 504 }));
}

async function libFile(req) {
  const cache = await caches.open(LIB_CACHE);
  const saved = await cache.match(req);
  if (saved) return saved;
  const res = await fetch(req);
  if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
  return res;
}
