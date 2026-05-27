/* MedTrack Service Worker */
const CACHE = 'medtrack-v2';
const CORE_ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/manifest.json'
];

// Install: cache core assets only (skip external fonts — they can block install)
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate: clean up old caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// Fetch: cache-first for local assets, network-first for external
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Skip non-GET and cross-origin non-font requests
  if (e.request.method !== 'GET') return;

  // For Google Fonts — network first, fall back silently
  if (url.hostname.includes('fonts.g')) {
    e.respondWith(
      fetch(e.request).catch(() => new Response('', { status: 408 }))
    );
    return;
  }

  // For same-origin assets — cache first, then network
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request)
        .then(response => {
          // Cache successful same-origin responses
          if (response.ok && url.origin === self.location.origin) {
            const clone = response.clone();
            caches.open(CACHE).then(c => c.put(e.request, clone));
          }
          return response;
        })
        .catch(() => {
          // Offline fallback to index.html for navigation
          if (e.request.mode === 'navigate') {
            return caches.match('/index.html');
          }
        });
    })
  );
});
