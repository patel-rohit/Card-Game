/* Service worker: makes Points Game installable and usable offline.
   Game data lives in localStorage and is never touched here; this only caches
   the app's files.

   Bump VERSION on every release (same value as <meta name="app-version"> in
   index.html) so phones pick up the new files. */
const VERSION = '2026.11.09-2';
const CACHE = 'points-game-' + VERSION;

// Files needed to start the app offline. Same-origin files must all succeed.
const APP_FILES = [
  './',
  'index.html',
  'manifest.webmanifest',
  'manifest.webmanifest?v=' + VERSION,
  'assets/img/logo-192.png?v=' + VERSION,
  'assets/img/apple-touch-icon.png?v=' + VERSION,
  'assets/js/storage.js?v=' + VERSION,
  'assets/js/models.js?v=' + VERSION,
  'assets/js/ui.js?v=' + VERSION,
  'assets/js/share.js?v=' + VERSION,
  'assets/js/summary.js?v=' + VERSION,
  'assets/js/pwa.js?v=' + VERSION,
  'assets/js/main.js?v=' + VERSION,
  'assets/img/logo.svg?v=' + VERSION,
  'assets/img/logo-192.png',
  'assets/img/logo-512.png',
  'assets/img/logo-maskable-512.png',
  'assets/img/apple-touch-icon.png'
];

// Libraries from CDNs (pinned versions). Cached when reachable; the app still
// installs if one of them cannot be fetched right now.
const CDN_FILES = [
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.23/jspdf.plugin.autotable.min.js',
  'https://fonts.googleapis.com/css2?family=Cinzel:wght@700&display=swap'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(APP_FILES);
    await Promise.all(CDN_FILES.map(url =>
      cache.add(new Request(url, { mode: 'cors', credentials: 'omit' })).catch(() => { /* best effort */ })
    ));
  })());
  // The page decides when to switch to the new version (Update button).
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('points-game-') && k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // The app's own "is there a newer version?" check must always reach the network.
  if (url.origin === self.location.origin && url.searchParams.has('_')) return;

  // Pages: network first so a new release shows up, cached copy when offline.
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        if (fresh && fresh.ok) {
          const cache = await caches.open(CACHE);
          cache.put('index.html', fresh.clone());
        }
        return fresh;
      } catch (e) {
        const cache = await caches.open(CACHE);
        return (await cache.match('index.html')) || (await cache.match('./')) || Response.error();
      }
    })());
    return;
  }

  const sameOrigin = url.origin === self.location.origin;
  const cdn = /^(cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)$/.test(url.hostname);
  if (!sameOrigin && !cdn) return;

  // App files and libraries: cached copy first (file names carry their version),
  // refreshed in the background.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req);
    const network = fetch(req).then(res => {
      if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
      return res;
    }).catch(() => null);
    if (cached) { event.waitUntil(network); return cached; }
    const res = await network;
    return res || Response.error();
  })());
});
