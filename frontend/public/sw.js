const CACHE_NAME = 'food-street-v4';
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json'
];

// Install service worker
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(urlsToCache);
      })
  );
  self.skipWaiting();
});

// Fetch - Network first, fallback to cache
self.addEventListener('fetch', (event) => {
  // Chỉ cache GET requests, bỏ qua POST/PUT/DELETE
  if (event.request.method !== 'GET') {
    return;
  }

  // Không can thiệp request cross-origin (API backend, CDN...) để tránh lỗi opaque/network.
  const reqUrl = new URL(event.request.url);
  if (reqUrl.origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Chỉ cache response thành công
        if (!response || response.status !== 200 || response.type === 'error') {
          return response;
        }

        // Clone response before caching
        const responseToCache = response.clone();
        caches.open(CACHE_NAME)
          .then((cache) => {
            cache.put(event.request, responseToCache);
          });
        return response;
      })
      .catch(() => {
        // If network fails, try cache
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }

          // Với điều hướng SPA, fallback về index.html nếu có trong cache.
          if (event.request.mode === 'navigate') {
            return caches.match('/index.html').then((indexResponse) => {
              if (indexResponse) {
                return indexResponse;
              }
              return new Response('Offline', {
                status: 503,
                headers: { 'Content-Type': 'text/plain; charset=utf-8' }
              });
            });
          }

          return new Response('Offline', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
          });
        });
      })
  );
});

// Activate - Clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});
