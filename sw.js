// ============================================================
//  Service worker — makes the whole app work with patchy or no
//  internet, while still showing your latest edits promptly.
//
//  Strategy: NETWORK-FIRST with a fast cache fallback.
//    • Online  → fetch the latest from the network (so a checklist
//      you edited and redeployed shows on the very next open), and
//      refresh the cache in the background.
//    • Slow (> NET_TIMEOUT) → serve the cached copy immediately so
//      the widget never hangs, while the network refresh finishes
//      in the background for next time.
//    • Offline → serve the cached copy (full offline capability).
//
//  Because content is fetched network-first at runtime, you do NOT
//  need to touch CACHE_VERSION for normal checklist edits. Bump it
//  only if you ever want to force every client to drop its cache.
// ============================================================

const CACHE_VERSION = 'pfc-v4';
const NET_TIMEOUT = 2500; // ms before falling back to cache when online-but-slow

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
  // Never intercept Spotify / weather / cross-origin calls — those hit the network.
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;

  // ignoreSearch on navigations so the OAuth redirect (?code=...) still
  // matches the cached app shell when we fall back to cache.
  const matchOpts = { ignoreSearch: e.request.mode === 'navigate' };
  const fallback = () =>
    caches.match(e.request, matchOpts).then(c => c || caches.match('./index.html'));

  e.respondWith(new Promise(resolve => {
    let settled = false;
    const done = r => { if (!settled && r) { settled = true; resolve(r); } };

    // If the network is slow, serve cache (when we have it) but let the
    // network request keep running to refresh the cache for next time.
    const timer = setTimeout(() => {
      caches.match(e.request, matchOpts).then(c => done(c));
    }, NET_TIMEOUT);

    fetch(e.request).then(res => {
      clearTimeout(timer);
      if (res && res.ok) {
        // Clone NOW, before the body streams to the page — cloning later
        // (inside the async caches.open callback) would fail on a locked body.
        const copy = res.clone();
        caches.open(CACHE_VERSION).then(c => c.put(e.request, copy));
        done(res);
      } else {
        // non-OK (e.g. 404): prefer a cached copy if we have one
        fallback().then(c => done(c || res));
      }
    }).catch(() => {
      clearTimeout(timer);
      fallback().then(done);
    });
  }));
});
