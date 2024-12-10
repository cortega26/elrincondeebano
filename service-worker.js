const CACHE_NAME = 'ebano-store-v1';
const ASSETS_CACHE = 'assets-v1';
const PRODUCT_CACHE = 'products-v1';

const CACHED_URLS = [
    '/',
    '/index.html',
    '/assets/css/critical.css',
    '/assets/css/style.css',
    '/assets/js/script.js',
    '/assets/images/web/logo.webp',
    '/pages/navbar.html',
    '/pages/footer.html',
    '/pages/offline.html'
];

// Install event
self.addEventListener('install', (event) => {
    event.waitUntil(
        Promise.all([
            caches.open(CACHE_NAME).then((cache) => {
                return cache.addAll(CACHED_URLS);
            }),
            caches.open(PRODUCT_CACHE).then(async (cache) => {
                try {
                    const response = await fetch('/_products/product_data.json');
                    if (response.ok) {
                        await cache.put('/_products/product_data.json', response.clone());
                    }
                } catch (error) {
                    console.warn('Initial product cache failed:', error);
                }
            })
        ])
    );
});

// Activate event
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames
                    .filter((name) => name.startsWith('ebano-') && name !== CACHE_NAME)
                    .map((name) => caches.delete(name))
            );
        })
    );
});

// Helper function to handle product data fetches
async function handleProductDataFetch(request) {
    try {
        // Try network first
        const networkResponse = await fetch(request);
        if (networkResponse.ok) {
            const cache = await caches.open(PRODUCT_CACHE);
            await cache.put(request, networkResponse.clone());
            return networkResponse;
        }
        
        // If network fails, try cache
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
            return cachedResponse;
        }
        
        throw new Error('Unable to fetch product data');
    } catch (error) {
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
            return cachedResponse;
        }
        throw error;
    }
}

// Helper function to handle asset fetches
async function handleAssetFetch(request) {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
        return cachedResponse;
    }
    
    try {
        const networkResponse = await fetch(request);
        if (networkResponse.ok) {
            const cache = await caches.open(ASSETS_CACHE);
            await cache.put(request, networkResponse.clone());
            return networkResponse;
        }
        throw new Error('Network response was not ok');
    } catch (error) {
        // For HTML pages, return offline page
        if (request.headers.get('Accept').includes('text/html')) {
            return caches.match('/pages/offline.html');
        }
        throw error;
    }
}

// Fetch event
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    
    // Handle same-origin requests only
    if (url.origin !== location.origin) {
        return;
    }
    
    // Special handling for product data
    if (url.pathname.includes('product_data.json')) {
        event.respondWith(handleProductDataFetch(event.request));
        return;
    }
    
    // Handle other requests
    event.respondWith(handleAssetFetch(event.request));
});

// Message event
self.addEventListener('message', (event) => {
    if (event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    } else if (event.data.type === 'INVALIDATE_PRODUCT_CACHE') {
        caches.open(PRODUCT_CACHE).then(cache => {
            cache.delete('/_products/product_data.json');
        });
    }
});
