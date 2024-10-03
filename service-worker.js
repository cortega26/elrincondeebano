const CACHE_NAME = 'el-rincon-de-ebano-v3';
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/assets/css/style.css',
    '/assets/js/script.js',
    '/assets/images/web/logo.webp',
    '/assets/images/web/favicon.ico',
    '/pages/offline.html'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                // Instead of cache.addAll(), we'll use a more resilient approach
                return Promise.all(
                    STATIC_ASSETS.map(url => {
                        // Attempt to cache each asset individually
                        return cache.add(url).catch(error => {
                            console.warn(`Failed to cache asset: ${url}`, error);
                            // Continue with the installation process even if an asset fails to cache
                            return Promise.resolve();
                        });
                    })
                );
            })
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
    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                if (response) {
                    return response;
                }
                return fetch(event.request).then((response) => {
                    // Check if we received a valid response
                    if (!response || response.status !== 200 || response.type !== 'basic') {
                        return response;
                    }

                    // Clone the response as it's a stream and can only be consumed once
                    const responseToCache = response.clone();

                    caches.open(CACHE_NAME)
                        .then((cache) => {
                            cache.put(event.request, responseToCache);
                        });

                    return response;
                });
            })
            .catch(() => {
                return caches.match('/pages/offline.html');
            })
    );
});

// Basic push notification handling
self.addEventListener('push', (event) => {
    const options = {
        body: event.data ? event.data.text() : 'No payload',
        icon: '/assets/images/web/logo.webp',
        badge: '/assets/images/web/favicon.ico'
    };

    event.waitUntil(
        self.registration.showNotification('El Rincón de Ébano', options)
    );
});

// Basic notification click handling
self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    event.waitUntil(
        clients.openWindow('https://elrincondeebano.com/')
    );
});