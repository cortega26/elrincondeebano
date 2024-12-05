// Enhanced service-worker.js with improved cache management and error handling
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
self.addEventListener('install', (event) => {
    event.waitUntil(
        (async () => {
            try {
                const cache = await caches.open(CACHE_CONFIG.prefixes.static);
                
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
                    }
                }
                
                await self.skipWaiting();
                console.log('Service Worker installed successfully');
            } catch (error) {
                console.error('Service Worker installation failed:', error);
            }
        })()
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        Promise.all([
            // Clean up old caches
            (async () => {
                const cacheKeys = await caches.keys();
                const validPrefixes = Object.values(CACHE_CONFIG.prefixes);
                
                return Promise.all(
                    cacheKeys
                        .filter(key => validPrefixes.every(prefix => !key.startsWith(prefix)))
                        .map(key => caches.delete(key))
                );
            })(),
            self.clients.claim()
        ])
    );
});

// Handle product data fetch
async function handleProductDataFetch(request) {
    try {
        // Try network first for product data
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

    // Fall back to cache
    const cachedResponse = await caches.match(request);
    if (cachedResponse && isCacheFresh(cachedResponse, 'products')) {
        return cachedResponse;
    }

    // If cache is stale, try network again
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
        // Return stale cache as last resort
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

    // Don't intercept CDN requests
    const url = new URL(request.url);
    if (url.hostname.includes('cdn') || 
        url.hostname.includes('fonts.googleapis.com') ||
        url.hostname.includes('fonts.gstatic.com')) {
        return fetch(request);
    }
    
    // For non-GET requests, go straight to network
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
        
        // Return default placeholder for failed image requests
        if (request.url.match(/\.(jpg|jpeg|png|gif|webp)$/)) {
            return caches.match('/assets/images/web/placeholder.webp');
        }
        throw error;
    }
}

// Fetch event handler
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Ignore Chrome extension requests
    if (url.protocol === 'chrome-extension:') {
        return;
    }

    // Handle only requests from our own domain and specific CDN resources
    if (!url.pathname.includes('product_data.json') && 
        !CACHE_CONFIG.staticAssets.includes(url.pathname) && 
        url.origin !== self.location.origin) {
        return;
    }
    
    // Special handling for product data
    if (url.pathname.includes('product_data.json')) {
        event.respondWith(handleProductDataFetch(event.request));
        return;
    }

    // Handle static assets
    if (CACHE_CONFIG.staticAssets.includes(url.pathname)) {
        event.respondWith(handleStaticAssetFetch(event.request));
        return;
    }

    // Handle other requests
    event.respondWith(handleDynamicFetch(event.request));
});

// Message event handler for cache invalidation
self.addEventListener('message', (event) => {
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