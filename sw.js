// ============================================================
//  Service worker — makes the whole app work with patchy or no
//  internet. Strategy: cache-first with background refresh
//  (stale-while-revalidate) for same-origin GETs, so the app is
//  instant and offline-proof, yet picks up new deploys whenever
//  a connection happens to be available.
//
//  Bump CACHE_VERSION when you change the site to force clients
//  to swap to the fresh cache on their next online visit.
// ============================================================

const CACHE_VERSION = 'pfc-v3';

const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/checklists.js',
  './js/spotify.js',
  './js/app.js',
  './manifest.webmanifest',
  './icon.svg',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_VERSION)
      .then(c => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // Never intercept Spotify / cross-origin calls — those must hit the network.
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;

  e.respondWith(
    // ignoreSearch on navigations so the OAuth redirect (?code=...) still
    // serves the cached app shell even when offline-registered.
    caches.match(e.request, { ignoreSearch: e.request.mode === 'navigate' }).then(cached => {
      const fresh = fetch(e.request).then(res => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then(c => c.put(e.request, copy));
        }
        return res;
      }).catch(() => null);

      return cached || fresh.then(res => res || caches.match('./index.html'));
    })
  );
});
