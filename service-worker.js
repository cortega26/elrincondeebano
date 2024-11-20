// service-worker.js - Updated version with pagination support
const CACHE_VERSION = 'v3';  // Incremented version
const CACHE_NAME = `el-rincon-de-ebano-${CACHE_VERSION}`;

// Assets that should be cached
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/assets/css/style.css',
    '/assets/js/script.js',
    '/assets/images/web/logo.webp',
    '/assets/images/web/favicon.ico',
    '/assets/images/web/placeholder.webp'  // Added placeholder image
];

// NEW: Cache duration settings
const CACHE_DURATION = {
    products: 60 * 60 * 1000, // 1 hour for product data
    assets: 7 * 24 * 60 * 60 * 1000 // 7 days for static assets
};

// Install event - cache static assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(STATIC_ASSETS))
            .then(() => self.skipWaiting())
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames
                        .filter((name) => name.startsWith('el-rincon-de-ebano-') && name !== CACHE_NAME)
                        .map((name) => caches.delete(name))
                );
            })
            .then(() => self.clients.claim())
    );
});

// NEW: Helper function to parse URL parameters
const getQueryParams = (url) => {
    const params = {};
    const searchParams = new URL(url).searchParams;
    for (const [key, value] of searchParams) {
        params[key] = value;
    }
    return params;
};

// NEW: Helper function to check cache freshness
const isCacheFresh = (response) => {
    const timestamp = response.headers.get('sw-timestamp');
    if (!timestamp) return false;

    const age = Date.now() - parseInt(timestamp);
    const maxAge = response.url.includes('product_data.json') 
        ? CACHE_DURATION.products 
        : CACHE_DURATION.assets;
    
    return age < maxAge;
};

// NEW: Modified fetch event handler with improved caching strategy
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    
    // Handle product data requests
    if (url.pathname.includes('product_data.json')) {
        event.respondWith(
            caches.match(event.request)
                .then(async (cachedResponse) => {
                    // Return cached response if it's fresh
                    if (cachedResponse && isCacheFresh(cachedResponse)) {
                        return cachedResponse;
                    }

                    // Otherwise fetch new data
                    try {
                        const response = await fetch(event.request);
                        if (!response.ok) throw new Error('Network response was not ok');

                        // Clone the response before caching
                        const responseToCache = response.clone();

                        // Add timestamp header
                        const headers = new Headers(responseToCache.headers);
                        headers.append('sw-timestamp', Date.now().toString());

                        // Create new response with timestamp
                        const timestampedResponse = new Response(
                            await responseToCache.blob(),
                            {
                                status: responseToCache.status,
                                statusText: responseToCache.statusText,
                                headers: headers
                            }
                        );

                        // Cache the timestamped response
                        const cache = await caches.open(CACHE_NAME);
                        await cache.put(event.request, timestampedResponse);

                        return response;
                    } catch (error) {
                        // Return stale cache if network fails
                        if (cachedResponse) return cachedResponse;
                        throw error;
                    }
                })
        );
        return;
    }

    // For other requests, use cache-first strategy
    event.respondWith(
        caches.match(event.request)
            .then((response) => response || fetch(event.request))
            .catch(() => {
                // Return default placeholder for failed image requests
                if (event.request.url.match(/\.(jpg|jpeg|png|gif|webp)$/)) {
                    return caches.match('/assets/images/web/placeholder.webp');
                }
                throw new Error('Network and cache both failed');
            })
    );
});

// NEW: Handle cache invalidation messages
self.addEventListener('message', (event) => {
    if (event.data.type === 'INVALIDATE_PRODUCT_CACHE') {
        caches.open(CACHE_NAME)
            .then((cache) => {
                return cache.keys()
                    .then((requests) => {
                        return Promise.all(
                            requests
                                .filter(request => request.url.includes('product_data.json'))
                                .map(request => cache.delete(request))
                        );
                    });
            });
    }
});