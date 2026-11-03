// Offline cache for the boletim prototype. Bump CACHE when any file changes.
const CACHE = 'boletim-proto-7';
const FILES = ['./', 'index.html', 'style.css?v=7', 'app.js?v=7', 'manifest.webmanifest', 'icon.svg', 'icon-180.png', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  // Pages: network first so a new version shows up; cache when offline.
  if (e.request.mode === 'navigate') return e.respondWith(fetch(e.request).catch(() => caches.match('index.html')));
  e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
    if (res.ok && (e.request.url.startsWith(self.location.origin) || e.request.url.includes('fonts.g') || e.request.url.includes('cdnjs.cloudflare.com'))) {
      const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy));
    }
    return res;
  }).catch(() => caches.match('index.html'))));
});
