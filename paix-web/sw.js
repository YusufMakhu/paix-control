/* Service worker — network-first (siempre lo último online; caché solo offline). */
const CACHE = 'paix-v5';
const ASSETS = ['.', 'index.html', 'app.js', 'font.js', 'anim.js', 'ble.js', 'theme.js', 'donate.html',
                'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then(resp => {
      const cp = resp.clone();
      caches.open(CACHE).then(c => c.put(e.request, cp));
      return resp;
    }).catch(() => caches.match(e.request).then(r => r || caches.match('index.html')))
  );
});
