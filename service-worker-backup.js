// Enhanced service-worker.js with improved cache management
const CACHE_NAME_PREFIX = 'el-rincon-de-ebano-';
const STATIC_CACHE = `${CACHE_NAME_PREFIX}static-v2`;
const DYNAMIC_CACHE = `${CACHE_NAME_PREFIX}dynamic-v1`;
const PRODUCT_CACHE = `${CACHE_NAME_PREFIX}products-v1`;

// Assets that should be cached
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/assets/css/style.css',
    '/assets/js/script.js',
    '/assets/images/web/logo.webp',
    '/assets/images/web/favicon.ico',
    '/assets/images/web/placeholder.webp'
];

// Cache duration settings (in milliseconds)
const CACHE_DURATION = {
    products: 5 * 60 * 1000,  // 5 minutes for product data
    static: 24 * 60 * 60 * 0,  // 24 hours for static assets
    dynamic: 12 * 60 * 60 * 1000  // 12 hours for dynamic content
};

// Install event - cache static assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then((cache) => cache.addAll(STATIC_ASSETS))
            .then(() => self.skipWaiting())
    );
});

// Helper function to check if a response is fresh
const isCacheFresh = (response, type = 'static') => {
    if (!response || !response.headers) return false;
    
    const timestamp = response.headers.get('sw-timestamp');
    if (!timestamp) return false;

    const age = Date.now() - parseInt(timestamp);
    return age < CACHE_DURATION[type];
};

// Helper function to add timestamp to response
const addTimestamp = async (response, type = 'static') => {
    const headers = new Headers(response.headers);
    headers.append('sw-timestamp', Date.now().toString());
    headers.append('cache-type', type);
    
    return new Response(await response.blob(), {
        status: response.status,
        statusText: response.statusText,
        headers: headers
    });
};

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        Promise.all([
            caches.keys()
                .then((cacheNames) => {
                    return Promise.all(
                        cacheNames
                            .filter((name) => name.startsWith(CACHE_NAME_PREFIX))
                            .map((name) => {
                                if (![STATIC_CACHE, DYNAMIC_CACHE, PRODUCT_CACHE].includes(name)) {
                                    return caches.delete(name);
                                }
                            })
                    );
                }),
            self.clients.claim()
        ])
    );
});

// Fetch event handler with improved caching strategy
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    
    // Special handling for product data
    if (url.pathname.includes('product_data.json')) {
        event.respondWith(handleProductDataFetch(event.request));
        return;
    }

    // Handle static assets
    if (STATIC_ASSETS.includes(url.pathname)) {
        event.respondWith(handleStaticAssetFetch(event.request));
        return;
    }

    // Handle other requests
    event.respondWith(handleDynamicFetch(event.request));
});

// Handle product data fetch
async function handleProductDataFetch(request) {
    try {
        // Try network first for product data
        const networkResponse = await fetch(request);
        if (networkResponse.ok) {
            const cache = await caches.open(PRODUCT_CACHE);
            const timestampedResponse = await addTimestamp(networkResponse.clone(), 'products');
            await cache.put(request, timestampedResponse);
            return networkResponse;
        }
    } catch (error) {
        console.log('Network fetch failed, trying cache:', error);
    }

    // Fall back to cache
    const cachedResponse = await caches.match(request);
    if (cachedResponse && isCacheFresh(cachedResponse, 'products')) {
        return cachedResponse;
    }

    // If cache is stale, try network again
    try {
        const networkResponse = await fetch(request);
        if (networkResponse.ok) {
            const cache = await caches.open(PRODUCT_CACHE);
            const timestampedResponse = await addTimestamp(networkResponse.clone(), 'products');
            await cache.put(request, timestampedResponse);
            return networkResponse;
        }
    } catch (error) {
        console.log('Both network and cache failed:', error);
        // Return stale cache as last resort
        if (cachedResponse) {
            return cachedResponse;
        }
    }

    // If all else fails, throw error
    throw new Error('Unable to fetch product data');
}

// Handle static asset fetch
async function handleStaticAssetFetch(request) {
    const cachedResponse = await caches.match(request);
    if (cachedResponse && isCacheFresh(cachedResponse, 'static')) {
        return cachedResponse;
    }

    try {
        const networkResponse = await fetch(request);
        if (networkResponse.ok) {
            const cache = await caches.open(STATIC_CACHE);
            const timestampedResponse = await addTimestamp(networkResponse.clone(), 'static');
            await cache.put(request, timestampedResponse);
            return networkResponse;
        }
    } catch (error) {
        if (cachedResponse) return cachedResponse;
        throw error;
    }
}

// Handle dynamic content fetch
async function handleDynamicFetch(request) {
    // For non-GET requests, go straight to network
    if (request.method !== 'GET') {
        return fetch(request);
    }

    try {
        const networkResponse = await fetch(request);
        if (networkResponse.ok) {
            const cache = await caches.open(DYNAMIC_CACHE);
            const timestampedResponse = await addTimestamp(networkResponse.clone(), 'dynamic');
            await cache.put(request, timestampedResponse);
            return networkResponse;
        }
    } catch (error) {
        const cachedResponse = await caches.match(request);
        if (cachedResponse) return cachedResponse;
        
        // Return default placeholder for failed image requests
        if (request.url.match(/\.(jpg|jpeg|png|gif|webp)$/)) {
            return caches.match('/assets/images/web/placeholder.webp');
        }
        throw error;
    }
}

// Message event handler for cache invalidation
self.addEventListener('message', (event) => {
    if (event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    } else if (event.data.type === 'INVALIDATE_PRODUCT_CACHE') {
        invalidateCache(PRODUCT_CACHE);
    } else if (event.data.type === 'INVALIDATE_ALL_CACHES') {
        invalidateAllCaches();
    }
});

// Helper function to invalidate specific cache
async function invalidateCache(cacheName) {
    try {
        const cache = await caches.open(cacheName);
        const requests = await cache.keys();
        await Promise.all(requests.map(request => cache.delete(request)));
        console.log(`Cache ${cacheName} invalidated successfully`);
    } catch (error) {
        console.error(`Error invalidating cache ${cacheName}:`, error);
    }
}

// Helper function to invalidate all caches
async function invalidateAllCaches() {
    try {
        const cacheNames = await caches.keys();
        await Promise.all(
            cacheNames
                .filter(name => name.startsWith(CACHE_NAME_PREFIX))
                .map(name => caches.delete(name))
        );
        console.log('All caches invalidated successfully');
    } catch (error) {
        console.error('Error invalidating all caches:', error);
    }
}
