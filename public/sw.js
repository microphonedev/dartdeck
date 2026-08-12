const CACHE = 'dartdeck-v1';
const ASSETS = ['/', '/css/style.css', '/js/app.js', '/js/sounds.js', '/js/checkout.js'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});
self.addEventListener('fetch', e => {
  if (e.request.url.includes('/socket.io/')) return;
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});