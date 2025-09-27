// Service Worker Configuration
const TEST_MODE = typeof module !== 'undefined';
const CACHE_CONFIG = {
    prefixes: {
        static: 'ebano-static-v5',
        dynamic: 'ebano-dynamic-v3',
        products: 'ebano-products-v4'
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
        '/dist/css/style.min.css',
        '/dist/css/critical.min.css',
        '/dist/js/script.min.js',
        '/assets/images/web/logo.webp',
        '/assets/images/web/icon-192.png',
        '/assets/images/web/icon-512.png',
        '/assets/images/web/favicon.ico',
        '/assets/images/web/placeholder.webp',
        '/pages/offline.html'
    ]
};

// Message channel management
const MESSAGE_CONFIG = {
    timeout: 5000,
    debug: false
};

const messageChannels = new Map();

function cleanupMessageChannel(messageId) {
    const channel = messageChannels.get(messageId);
    if (channel) {
        clearTimeout(channel.timeoutId);
        messageChannels.delete(messageId);
        if (MESSAGE_CONFIG.debug) {
            console.log(`Cleaned up message channel ${messageId}`);
        }
    }
}

async function respondToMessage(event, handler) {
    const messageId = crypto.randomUUID();

    if (event.ports && event.ports[0]) {
        const timeoutId = setTimeout(() => {
            cleanupMessageChannel(messageId);
            event.ports[0].postMessage({
                error: 'Message handling timed out',
                messageId
            });
        }, MESSAGE_CONFIG.timeout);

        messageChannels.set(messageId, {
            port: event.ports[0],
            timeoutId,
            created: Date.now()
        });

        try {
            const result = await handler();
            event.ports[0].postMessage({
                success: true,
                data: result,
                messageId
            });
        } catch (error) {
            event.ports[0].postMessage({
                error: error.message,
                messageId
            });
        } finally {
            cleanupMessageChannel(messageId);
        }
    } else {
        // Maintain backwards compatibility for existing message handling
        await handler();
    }
}

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
if (!TEST_MODE) {
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
                                .filter(name => !validPrefixes.some(prefix => name.startsWith(prefix)))
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
                await cache.put(request, timestampedResponse.clone());
                return timestampedResponse;
            }
        } catch (error) {
            console.log('Network fetch failed, trying cache:', error);
            const cachedResponse = await caches.match(request);
            if (cachedResponse && isCacheFresh(cachedResponse, 'products')) {
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
            // Offline navigation fallback when possible
            if (request.mode === 'navigate') {
                const offline = await caches.match('/pages/offline.html');
                if (offline) return offline;
            }
            if (request.url.match(/\.(jpg|jpeg|png|gif|webp)$/)) {
                const ph = await caches.match('/assets/images/web/placeholder.webp');
                if (ph) return ph;
            }
            throw error;
        }
    }

    // Fetch event handler
    self.addEventListener('fetch', event => {
        const url = new URL(event.request.url);
        if (url.pathname.startsWith('/cdn-cgi/image/')) return; // let edge handle it

        // Removed early network-first branch; unified handling below

        // First, explicitly check if this is a request we should handle
        const isHandleableRequest =
            // Check if it's our product data
            url.pathname.includes('product_data.json') ||
            // Check if it's one of our static assets
            CACHE_CONFIG.staticAssets.includes(url.pathname) ||
            // Check if it's a request to our domain that isn't a third-party script
            (url.origin === self.location.origin && !url.pathname.includes('analytics'));

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

    // Enhanced message event handler with backwards compatibility
    self.addEventListener('message', event => {
        if (event.data.type === 'SKIP_WAITING') {
            self.skipWaiting();
        } else if (event.data.type === 'INVALIDATE_PRODUCT_CACHE') {
            respondToMessage(event, async () => {
                await invalidateCache(CACHE_CONFIG.prefixes.products);
                return { status: 'product_cache_invalidated' };
            });
        } else if (event.data.type === 'INVALIDATE_ALL_CACHES') {
            respondToMessage(event, async () => {
                await invalidateAllCaches();
                return { status: 'all_caches_invalidated' };
            });
        }
    });
}

// Helper function to invalidate specific cache
async function invalidateCache(cacheName) {
    try {
        const cache = await caches.open(cacheName);
        const requests = await cache.keys();
        await Promise.all(requests.map(request => cache.delete(request)));
        console.log(`Cache ${cacheName} invalidated successfully`);
    } catch (error) {
        console.error(`Error invalidating cache ${cacheName}:`, error);
        throw error; // Propagate error for proper handling in message response
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
        throw error; // Propagate error for proper handling in message response
    }
}

if (typeof module !== "undefined") {
    module.exports = {
        isCacheFresh,
        addTimestamp,
        invalidateCache,
        invalidateAllCaches,
        CACHE_CONFIG
    };
}

