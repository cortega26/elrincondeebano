// Service Worker Configuration
const CACHE_CONFIG = {
    prefixes: {
        static: 'ebano-static-v2',
        dynamic: 'ebano-dynamic-v1',
        products: 'ebano-products-v1'
    },
    duration: {
        products: 5 * 60 * 1000,     // 5 minutes for product data
        static: 24 * 60 * 60 * 1000, // 24 hours for static assets
        dynamic: 12 * 60 * 60 * 1000 // 12 hours for dynamic content
    },
    staticAssets: [
        '/',
        '/index.html',
        '/404.html',
        '/assets/css/style.css',
        '/assets/css/critical.css',
        '/assets/js/script.js',
        '/assets/images/web/logo.webp',
        '/assets/images/web/favicon.ico',
        '/assets/images/web/placeholder.webp',
        '/pages/offline.html'
    ]
};

// Helper function to check if a response is fresh
const isCacheFresh = (response, type = 'static') => {
    if (!response?.headers) return false;
    const timestamp = response.headers.get('sw-timestamp');
    if (!timestamp) return false;
    const age = Date.now() - parseInt(timestamp);
    return age < CACHE_CONFIG.duration[type];
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

// Install event - cache static assets
self.addEventListener('install', event => {
    console.log('Service Worker: Installing...');
    event.waitUntil(
        (async () => {
            try {
                const cache = await caches.open(CACHE_CONFIG.prefixes.static);
                console.log('Service Worker: Cache opened');
                
                // Cache static assets individually for better error handling
                for (const asset of CACHE_CONFIG.staticAssets) {
                    try {
                        const response = await fetch(asset);
                        if (response.ok) {
                            const timestampedResponse = await addTimestamp(response.clone(), 'static');
                            await cache.put(asset, timestampedResponse);
                        }
                    } catch (err) {
                        console.warn(`Failed to cache asset ${asset}:`, err);
                        // Continue with other assets even if one fails
                    }
                }
                
                await self.skipWaiting();
                console.log('Service Worker: Installation complete');
            } catch (error) {
                console.error('Service Worker: Installation failed:', error);
                throw error;
            }
        })()
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
    console.log('Service Worker: Activating...');
    event.waitUntil(
        Promise.all([
            caches.keys()
                .then(cacheNames => {
                    const validPrefixes = Object.values(CACHE_CONFIG.prefixes);
                    return Promise.all(
                        cacheNames
                            .filter(name => validPrefixes.some(prefix => !name.startsWith(prefix)))
                            .map(name => caches.delete(name))
                    );
                }),
            self.clients.claim()
        ]).then(() => console.log('Service Worker: Now controlling all clients'))
    );
});

// Handle product data fetch
async function handleProductDataFetch(request) {
    try {
        const networkResponse = await fetch(request);
        if (networkResponse.ok) {
            const cache = await caches.open(CACHE_CONFIG.prefixes.products);
            const timestampedResponse = await addTimestamp(networkResponse.clone(), 'products');
            await cache.put(request, timestampedResponse);
            return networkResponse;
        }
    } catch (error) {
        console.log('Network fetch failed, trying cache:', error);
    }

    const cachedResponse = await caches.match(request);
    if (cachedResponse && isCacheFresh(cachedResponse, 'products')) {
        return cachedResponse;
    }

    try {
        const networkResponse = await fetch(request);
        if (networkResponse.ok) {
            const cache = await caches.open(CACHE_CONFIG.prefixes.products);
            const timestampedResponse = await addTimestamp(networkResponse.clone(), 'products');
            await cache.put(request, timestampedResponse);
            return networkResponse;
        }
    } catch (error) {
        console.log('Both network and cache failed:', error);
        if (cachedResponse) {
            return cachedResponse;
        }
    }

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
            const cache = await caches.open(CACHE_CONFIG.prefixes.static);
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
    if (request.method !== 'GET') {
        return fetch(request);
    }

    try {
        const networkResponse = await fetch(request);
        if (networkResponse.ok) {
            const cache = await caches.open(CACHE_CONFIG.prefixes.dynamic);
            const timestampedResponse = await addTimestamp(networkResponse.clone(), 'dynamic');
            await cache.put(request, timestampedResponse);
            return networkResponse;
        }
    } catch (error) {
        const cachedResponse = await caches.match(request);
        if (cachedResponse) return cachedResponse;
        
        if (request.url.match(/\.(jpg|jpeg|png|gif|webp)$/)) {
            return caches.match('/assets/images/web/placeholder.webp');
        }
        throw error;
    }
}

// Fetch event handler
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);
    
    // First, explicitly check if this is a request we should handle
    const isHandleableRequest = 
        // Check if it's our product data
        url.pathname.includes('product_data.json') ||
        // Check if it's one of our static assets
        CACHE_CONFIG.staticAssets.includes(url.pathname) ||
        // Check if it's a request to our domain that isn't a third-party script
        (url.origin === self.location.origin && 
         !url.pathname.includes('gtag') && 
         !url.pathname.includes('analytics'));

    // Only proceed if it's a request we should handle
    if (!isHandleableRequest) {
        return;
    }

    // Now we know this is a request we want to handle
    if (url.pathname.includes('product_data.json')) {
        event.respondWith(handleProductDataFetch(event.request));
    } else if (CACHE_CONFIG.staticAssets.includes(url.pathname)) {
        event.respondWith(handleStaticAssetFetch(event.request));
    } else {
        event.respondWith(handleDynamicFetch(event.request));
    }
});

// Message event handler for cache invalidation
self.addEventListener('message', event => {
    if (event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    } else if (event.data.type === 'INVALIDATE_PRODUCT_CACHE') {
        invalidateCache(CACHE_CONFIG.prefixes.products);
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
        const validPrefixes = Object.values(CACHE_CONFIG.prefixes);
        await Promise.all(
            cacheNames
                .filter(name => validPrefixes.some(prefix => name.startsWith(prefix)))
                .map(name => caches.delete(name))
        );
        console.log('All caches invalidated successfully');
    } catch (error) {
        console.error('Error invalidating all caches:', error);
    }
}