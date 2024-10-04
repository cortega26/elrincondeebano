const CACHE_NAME = 'el-rincon-de-ebano-v5';
const CACHE_VERSION_KEY = 'cache-version';
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
                return Promise.all([
                    ...STATIC_ASSETS.map(url => 
                        cache.add(url).catch(error => {
                            console.warn(`Failed to cache asset: ${url}`, error);
                            return Promise.resolve();
                        })
                    ),
                    cache.put(CACHE_VERSION_KEY, new Response(CACHE_NAME))
                ]);
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
                    // If we have a cached response, return it but also fetch an update
                    fetchAndUpdate(event.request);
                    return response;
                }
                return fetchAndUpdate(event.request);
            })
            .catch(() => {
                return caches.match('/pages/offline.html');
            })
    );
});

function fetchAndUpdate(request) {
    return fetch(request).then((response) => {
        if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
        }

        const responseToCache = response.clone();

        caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
        });

        return response;
    });
}

self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'CHECK_VERSION') {
        event.waitUntil(
            caches.open(CACHE_NAME).then((cache) => {
                return cache.match(CACHE_VERSION_KEY).then((response) => {
                    if (response) {
                        return response.text();
                    }
                    return null;
                });
            }).then((cachedVersion) => {
                event.source.postMessage({
                    type: 'VERSION_CHECK_RESULT',
                    currentVersion: CACHE_NAME,
                    cachedVersion: cachedVersion
                });
            })
        );
    }
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
