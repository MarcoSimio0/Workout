// Service worker: rende l'app disponibile offline.
// Quando modifichi i file dell'app, aumenta il numero di versione qui sotto.
const CACHE = 'scheda-palestra-v7';

const FILE = [
  './',
  './index.html',
  './css/style.css',
  './js/dieta.js',
  './js/app.js',
  './manifest.webmanifest',
  './scheda-iniziale.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];

// cache: 'reload' scavalca la cache del browser: dopo un aggiornamento arrivano
// tutti i file nuovi, mai un misto di vecchi e nuovi.
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE)
    .then(c => c.addAll(FILE.map(f => new Request(f, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(chiavi => Promise.all(chiavi.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Tocco sulla notifica di fine recupero: si torna all'app.
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(finestre => {
    const app = finestre.find(c => c.url.startsWith(self.registration.scope));
    return app ? app.focus() : self.clients.openWindow('./');
  }));
});

// Risponde subito dalla cache e intanto aggiorna la copia dalla rete:
// le modifiche pubblicate si vedono alla seconda apertura dell'app.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(async cache => {
    const inCache = await cache.match(e.request, { ignoreSearch: true });
    const daRete = fetch(e.request, { cache: 'no-cache' })
      .then(r => { if (r.ok) cache.put(e.request, r.clone()); return r; })
      .catch(() => null);
    if (inCache) {
      e.waitUntil(daRete);
      return inCache;
    }
    const r = await daRete;
    if (r) return r;
    if (e.request.mode === 'navigate') return cache.match('./index.html');
    return Response.error();
  }));
});
