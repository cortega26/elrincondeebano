const CACHE_NAME = 'el-rincon-de-ebano-v4';
const STATIC_ASSETS = [
    '/elrincondeebano/',
    '/elrincondeebano/index.html',
    '/elrincondeebano/assets/css/style.css',
    '/elrincondeebano/assets/js/script.js',
    '/elrincondeebano/assets/images/web/logo.webp',
    '/elrincondeebano/assets/images/web/favicon.ico',
    '/elrincondeebano/offline.html'
];

// Helper function to determine if URL is from the same origin
const isInternalUrl = (url) => {
    return new URL(url, self.location.origin).origin === self.location.origin;
};

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(STATIC_ASSETS))
            .then(() => self.skipWaiting())
    );
});

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
        }).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const request = event.request;

    // For navigation requests, use network-first strategy
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                .catch(() => caches.match('/elrincondeebano/offline.html'))
        );
        return;
    }

    // For other requests, use cache-first strategy
    event.respondWith(
        caches.match(request)
            .then((response) => {
                if (response) {
                    return response;
                }
                return fetch(request).then((networkResponse) => {
                    if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
                        return networkResponse;
                    }
                    if (isInternalUrl(request.url)) {
                        const responseToCache = networkResponse.clone();
                        caches.open(CACHE_NAME)
                            .then((cache) => {
                                cache.put(request, responseToCache);
                            });
                    }
                    return networkResponse;
                });
            })
            .catch(() => {
                // If the request is for an image, you could return a default offline image
                if (request.destination === 'image') {
                    return caches.match('/elrincondeebano/assets/images/web/offline-image-placeholder.webp');
                }
            })
    );
});

self.addEventListener('push', (event) => {
    const options = {
        body: event.data ? event.data.text() : 'No payload',
        icon: '/elrincondeebano/assets/images/web/logo.webp',
        badge: '/elrincondeebano/assets/images/web/favicon.ico'
    };

    event.waitUntil(
        self.registration.showNotification('El Rincón de Ébano', options)
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    event.waitUntil(
        clients.openWindow('https://cortega26.github.io/elrincondeebano/')
    );
});

// Self update
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});