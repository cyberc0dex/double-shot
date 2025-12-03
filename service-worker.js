const CACHE_NAME = 'doubleshot-v2.0.1';
const urlsToCache = [
  './',
  './index.html',
  './tailwind.css',
  './style.css',
  './biome-font.css',
  './app.js',
  './manifest.json',
  './img/badminton1.png',
  './img/badminton2.png',
  './img/badminton3.png',
  './img/badminton4.png',
  './img/logo.png',
  './img/icon-180.png',
  './img/icon-192.png',
  './img/icon-512.png',
  './fonts/BiomeW04-Regular.woff',
  './fonts/BiomeW04-Regular.woff2'
];

// Install service worker and cache files
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
});

// Fetch from cache first, then network
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Cache hit - return response
        if (response) {
          return response;
        }
        return fetch(event.request);
      }
    )
  );
});

// Activate and clean up old caches
self.addEventListener('activate', (event) => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});