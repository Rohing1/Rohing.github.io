const CACHE = 'moye-reader-shell-v16';
const BOOK_CACHE = 'moye-reader-books-v1';
const ASSETS = [
  './', 'index-2.html', 'reader.css', 'reader-additions.css', 'reader.js',
  'vendor/epub.min.js', 'vendor/jszip.min.js'
];
const BOOKS = [
  './books/lighthouse.epub', './books/station.epub',
  './books/garden.epub', './books/river.epub',
  './books/liaozhai-zhiyi.epub', './books/byte-of-python.epub',
  './books/o-henry-selected.epub', './books/wilde-selected.epub',
  './books/million-pound.epub', './books/busy-broker.epub',
  './books/service-of-love.epub'
];
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Do not seed a new offline cache from an old HTTP cache on iPhone.
    await Promise.all(ASSETS.map(async (asset) => {
      const url = new URL(asset, self.registration.scope);
      const response = await fetch(url, { cache: 'reload' });
      if (!response.ok) throw new Error(`Unable to cache ${asset}`);
      await cache.put(url, response);
    }));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys(); const books = await caches.open(BOOK_CACHE);
    for (const key of keys.filter((item) => item.startsWith('moye-reader-shell-') && item !== CACHE)) {
      const old = await caches.open(key);
      for (const asset of BOOKS) {
        const url = new URL(asset, self.registration.scope);
        if (!(await books.match(url))) { const response = await old.match(url); if (response) await books.put(url, response); }
      }
      await caches.delete(key);
    }
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(new URL(self.registration.scope).pathname)) return;
  if (BOOKS.some((asset) => url.href === new URL(asset, self.registration.scope).href)) {
    event.respondWith(caches.open(BOOK_CACHE).then((cache) => cache.match(request).then((cached) => cached || fetch(request, { cache: 'no-store' }))));
    return;
  }
  event.respondWith(caches.open(CACHE).then((cache) => cache.match(request, { ignoreSearch: true }).then((cached) => cached || fetch(request).then((response) => {
    if (response.ok) { const copy = response.clone(); caches.open(CACHE).then((cache) => cache.put(request, copy)); }
    return response;
  }))));
});
