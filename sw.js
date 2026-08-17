const CACHE = 'vr-spoed-v3';

const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './config.js',
  './manifest.webmanifest',
  './icon.svg'
];

self.addEventListener('install', event => {
  self.skipWaiting();

  event.waitUntil(
    caches.open(CACHE).then(cache => {
      return cache.addAll(ASSETS);
    })
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    Promise.all([
      clients.claim(),

      caches.keys().then(keys => {
        return Promise.all(
          keys
            .filter(key => key !== CACHE)
            .map(key => caches.delete(key))
        );
      })
    ])
  );
});

self.addEventListener('fetch', event => {
  if(event.request.method !== 'GET'){
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(response => {
        const copy = response.clone();

        caches.open(CACHE).then(cache => {
          cache.put(event.request, copy);
        });

        return response;
      })
      .catch(() => {
        return caches.match(event.request);
      })
  );
});
