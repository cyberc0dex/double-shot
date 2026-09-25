/**
 * Double Shot service worker.
 *
 * Registered only when config.js sets APP_ENV to 'production'. In development
 * the app unregisters this worker and deletes its caches on boot, so nothing
 * here can serve a stale file while you are working.
 *
 * The cache name comes from the ?v= query on the registration URL, which the
 * app fills from APP_VERSION. There is no second version constant to bump.
 *
 * Strategy:
 *   Navigations and app code  network first, cache as a fallback. A deploy is
 *                             picked up on the next load rather than waiting
 *                             for a manual cache-name bump.
 *   Fonts, icons and images   cache first. They are immutable in practice and
 *                             this is what makes a cold offline load fast.
 */

const VERSION = new URL(self.location.href).searchParams.get('v') || 'dev';
const CACHE = `doubleshot-${VERSION}`;

const PRECACHE = [
  './',
  './index.html',
  './manifest.json',
  './config.js',
  './css/app.css',
  './js/app.js',
  './js/state.js',
  './js/storage.js',
  './js/render.js',
  './js/ui.js',
  './js/share.js',
  './js/format.js',
  './js/highlights.js',
  './js/matchmaking.js',
  './img/logo.png',
  './img/icon-180.png',
  './img/icon-192.png',
  './img/icon-512.png',
  './fonts/BiomeW04-Regular.woff2',
  './fonts/BiomeW04-Regular.woff'
];

const isAsset = url =>
  /\.(woff2?|png|jpg|jpeg|svg|webp|ico)$/i.test(url.pathname);

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // addAll rejects the whole install if any single file 404s, so add them
    // individually and let the rest through.
    await Promise.all(PRECACHE.map(async path => {
      try {
        await cache.add(new Request(path, { cache: 'reload' }));
      } catch (error) {
        console.warn('[sw] could not precache', path, error);
      }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(
      names.filter(name => name.startsWith('doubleshot-') && name !== CACHE)
           .map(name => caches.delete(name))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Cache first for immutable assets.
  if (isAsset(url)) {
    event.respondWith((async () => {
      const hit = await caches.match(request);
      if (hit) return hit;
      const response = await fetch(request);
      if (response.ok) (await caches.open(CACHE)).put(request, response.clone());
      return response;
    })());
    return;
  }

  // Network first for the document and the app code.
  event.respondWith((async () => {
    try {
      const response = await fetch(request);
      if (response.ok) (await caches.open(CACHE)).put(request, response.clone());
      return response;
    } catch (error) {
      const hit = await caches.match(request);
      if (hit) return hit;
      if (request.mode === 'navigate') {
        const shell = await caches.match('./index.html');
        if (shell) return shell;
      }
      throw error;
    }
  })());
});
