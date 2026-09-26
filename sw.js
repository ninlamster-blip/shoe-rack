// Keeps the app opening offline. Only this app's own files are cached;
// requests to Anthropic and the SDK CDN always go to the network.
const CACHE = 'shoe-rack-v2';
const SHELL = [
  './', './index.html', './manifest.webmanifest', './css/app.css',
  './js/app.js', './js/shared.js', './js/rack.js', './js/store.js', './js/image.js', './js/ai.js', './js/ui.js',
  './js/views/rack.js', './js/views/pair.js', './js/views/check.js', './js/views/scan.js', './js/views/insights.js',
  './js/views/style.js', './js/views/ask.js', './js/views/family.js', './js/views/settings.js',
  './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Network first so an update shows up on the next open; the cache is the
// fallback for when there is no signal.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r ?? caches.match('./index.html'))),
  );
});
