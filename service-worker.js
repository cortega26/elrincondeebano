// Service Worker Configuration
const TEST_MODE =
  typeof module !== 'undefined' &&
  !(typeof globalThis !== 'undefined' && globalThis.__SW_RUNTIME_TEST__ === true);
const CACHE_CONFIG = {
  prefixes: {
    static: 'ebano-static-v7',
    dynamic: 'ebano-dynamic-v5',
    products: 'ebano-products-v6',
    html: 'ebano-html-v1',
  },
  duration: {
    html: 60 * 1000, // 1 minute for HTML navigations
    products: 2 * 60 * 1000, // 2 minutes for product data
    static: 24 * 60 * 60 * 1000, // 24 hours for static assets
    dynamic: 12 * 60 * 60 * 1000, // 12 hours for dynamic content
  },
  staticAssets: [
    '/',
    '/index.html',
    '/404.html',
    '/asset-manifest.json',
    '/dist/css/style.min.css',
    '/dist/css/style.category.min.css',
    '/dist/css/critical.min.css',
    '/dist/js/script.min.js',
    '/assets/images/web/logo.webp',
    '/assets/images/web/icon-192.png',
    '/assets/images/web/icon-512.png',
    '/assets/images/web/favicon.ico',
    '/assets/images/web/placeholder.svg',
    '/pages/offline.html',
  ],
};

const FALLBACKS = {
  imagePlaceholder: '/assets/images/web/placeholder.svg',
};

// Message channel management
const MESSAGE_CONFIG = {
  timeout: 5000,
  debug: false,
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
        messageId,
      });
    }, MESSAGE_CONFIG.timeout);

    messageChannels.set(messageId, {
      port: event.ports[0],
      timeoutId,
      created: Date.now(),
    });

    try {
      const result = await handler();
      event.ports[0].postMessage({
        success: true,
        data: result,
        messageId,
      });
    } catch (error) {
      event.ports[0].postMessage({
        error: error.message,
        messageId,
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
    headers: headers,
  });
};

const isNoStoreResponse = (response) => {
  const cacheControl = response?.headers?.get('cache-control');
  if (!cacheControl) return false;
  return cacheControl.toLowerCase().includes('no-store');
};

const shouldSkipCache = (request, url, { ignoreAuth = false } = {}) => {
  if (
    url.pathname.startsWith('/admin') ||
    url.pathname.startsWith('/admin-panel') ||
    url.pathname.startsWith('/checkout') ||
    url.pathname.startsWith('/order') ||
    url.pathname.startsWith('/pedido') ||
    url.pathname.startsWith('/carrito') ||
    url.pathname.startsWith('/cart') ||
    url.pathname.startsWith('/payment') ||
    url.pathname.startsWith('/confirm') ||
    url.pathname.startsWith('/cdn-cgi/image/') ||
    url.pathname === '/service-worker.js'
  ) {
    return true;
  }
  if (ignoreAuth) {
    return false;
  }
  const authHeader = request.headers.get('authorization');
  return Boolean(authHeader);
};

const shouldBypass = (request, url) => shouldSkipCache(request, url, { ignoreAuth: true });

// Install event - cache static assets
if (!TEST_MODE) {
  self.addEventListener('install', (event) => {
    event.waitUntil(
      (async () => {
        await self.skipWaiting();
        try {
          const cache = await caches.open(CACHE_CONFIG.prefixes.static);
          await Promise.all(
            CACHE_CONFIG.staticAssets.map(async (asset) => {
              try {
                const response = await fetch(asset);
                if (response && response.ok) {
                  const timestampedResponse = await addTimestamp(response.clone(), 'static');
                  await cache.put(asset, timestampedResponse);
                }
              } catch (error) {
                console.warn(`Failed to cache asset ${asset}:`, error);
              }
            })
          );
          await cacheManifestAssets(cache);
        } catch (error) {
          console.error('Service Worker: Installation caching failed:', error);
        }
      })()
    );
  });

  // Activate event - clean up old caches
  self.addEventListener('activate', (event) => {
    event.waitUntil(
      (async () => {
        try {
          const validPrefixes = Object.values(CACHE_CONFIG.prefixes);
          const cacheNames = await caches.keys();
          await Promise.all(
            cacheNames
              .filter((name) => !validPrefixes.some((prefix) => name.startsWith(prefix)))
              .map((name) => caches.delete(name))
          );
        } catch (error) {
          console.error('Service Worker: Activation cleanup failed:', error);
        }
        await self.clients.claim();
      })()
    );
  });

  const getCacheKeyForRequest = (request, url) => {
    if (url.pathname.endsWith('.html')) {
      return { cacheName: CACHE_CONFIG.prefixes.html, type: 'html' };
    }
    if (url.pathname.startsWith('/dist/js/')) {
      return { cacheName: CACHE_CONFIG.prefixes.static, type: 'static' };
    }
    if (url.pathname.startsWith('/dist/css/')) {
      return { cacheName: CACHE_CONFIG.prefixes.static, type: 'static' };
    }
    if (url.pathname.includes('product_data.json')) {
      return { cacheName: CACHE_CONFIG.prefixes.products, type: 'products' };
    }
    if (CACHE_CONFIG.staticAssets.includes(url.pathname)) {
      return { cacheName: CACHE_CONFIG.prefixes.static, type: 'static' };
    }
    return { cacheName: CACHE_CONFIG.prefixes.dynamic, type: 'dynamic' };
  };

  const isImageRequest = (request) => {
    if (!request) {
      return false;
    }
    if (request.destination === 'image') {
      return true;
    }
    const accept = request.headers?.get('accept') || '';
    return accept.includes('image/');
  };

  const isProductDataRequest = (url) => url.pathname.includes('product_data.json');

  const getFallbackResponse = async (request) => {
    if (!request) {
      return null;
    }

    if (isImageRequest(request)) {
      try {
        const cache = await caches.open(CACHE_CONFIG.prefixes.static);
        const cachedPlaceholder = await cache.match(FALLBACKS.imagePlaceholder);
        if (cachedPlaceholder) {
          return cachedPlaceholder.clone();
        }
      } catch (error) {
        console.warn('Service Worker: Failed to serve placeholder from cache:', error);
      }

      try {
        const networkPlaceholder = await fetch(FALLBACKS.imagePlaceholder);
        if (networkPlaceholder && networkPlaceholder.ok) {
          return networkPlaceholder;
        }
      } catch (error) {
        console.warn('Service Worker: Failed to fetch placeholder image:', error);
      }
    }

    return null;
  };

  self.addEventListener('fetch', (event) => {
    const req = event.request;
    const url = new URL(req.url);

    if (req.method !== 'GET' || shouldBypass(req, url)) {
      return;
    }

    if (url.origin !== self.location.origin) {
      return;
    }

    const skipCache = shouldSkipCache(req, url);

    if (req.mode === 'navigate') {
      event.respondWith(
        (async () => {
          const htmlCache = await caches.open(CACHE_CONFIG.prefixes.html);
          try {
            const networkResponse = await fetch(req, { cache: 'no-store' });
            if (networkResponse) {
              if (!skipCache && networkResponse.ok && !isNoStoreResponse(networkResponse)) {
                const responseToCache = await addTimestamp(networkResponse.clone(), 'html');
                await htmlCache.put(req, responseToCache);
              }
              return networkResponse;
            }
          } catch (error) {
            console.warn('Navigation fetch failed, attempting cache fallback:', error);
          }

          const cached = await htmlCache.match(req);
          const canCheckFreshness =
            cached && cached.type !== 'opaque' && cached.type !== 'opaqueredirect';
          if (cached && canCheckFreshness && isCacheFresh(cached, 'html')) {
            return cached;
          }

          const fallback =
            (await caches.match('/index.html')) || (await caches.match('/pages/offline.html'));

          if (fallback) {
            return fallback;
          }

          return new Response('Offline', {
            status: 503,
            headers: { 'Content-Type': 'text/plain' },
          });
        })()
      );
      return;
    }

    event.respondWith(
      (async () => {
        if (skipCache) {
          try {
            const networkResponse = await fetch(req, { cache: 'no-store' });
            if (networkResponse) {
              return networkResponse;
            }
          } catch (error) {
            console.warn('Bypass cache request failed:', error);
          }

          const fallback = await getFallbackResponse(req);
          if (fallback) {
            return fallback;
          }

          return new Response('Servicio no disponible', {
            status: 504,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          });
        }

        if (isProductDataRequest(url)) {
          const cache = await caches.open(CACHE_CONFIG.prefixes.products);
          const cached = await cache.match(req);
          try {
            const networkResponse = await fetch(req, { cache: 'no-store' });
            if (networkResponse) {
              if (networkResponse.ok && !isNoStoreResponse(networkResponse)) {
                const responseToCache = await addTimestamp(networkResponse.clone(), 'products');
                await cache.put(req, responseToCache);
              }
              return networkResponse;
            }
          } catch (error) {
            console.warn('Product data fetch failed, attempting cache fallback:', error);
          }

          const canCheckFreshness =
            cached && cached.type !== 'opaque' && cached.type !== 'opaqueredirect';
          if (cached && canCheckFreshness && isCacheFresh(cached, 'products')) {
            return cached;
          }

          return new Response('Servicio no disponible', {
            status: 504,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          });
        }

        const { cacheName, type } = getCacheKeyForRequest(req, url);
        const cache = await caches.open(cacheName);
        const cached = await cache.match(req);

        let freshResponse;
        let networkError = false;
        try {
          freshResponse = await fetch(req);
          if (freshResponse && freshResponse.ok) {
            if (!isNoStoreResponse(freshResponse)) {
              const responseToCache = await addTimestamp(freshResponse.clone(), type);
              await cache.put(req, responseToCache);
            }
          }
        } catch (error) {
          networkError = true;
          console.warn('Asset fetch failed, falling back to cache:', error);
        }

        if (freshResponse) {
          return freshResponse;
        }

        if (cached) {
          if (isNoStoreResponse(cached)) {
            try {
              await cache.delete(req);
            } catch (error) {
              console.warn('Failed to delete no-store cached response:', error);
            }
          } else {
            const canCheckFreshness =
              cached.type !== 'opaque' && cached.type !== 'opaqueredirect';
            if (networkError && canCheckFreshness && isCacheFresh(cached, type)) {
              return cached;
            }
          }
        }

        if (networkError) {
          const fallback = await getFallbackResponse(req);
          if (fallback) {
            return fallback;
          }
        }

        return new Response('Servicio no disponible', {
          status: 504,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      })()
    );
  });

  // Enhanced message event handler with backwards compatibility
  self.addEventListener('message', (event) => {
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

async function cacheManifestAssets(cache) {
  try {
    const response = await fetch('/asset-manifest.json', { cache: 'no-store' });
    if (!response || !response.ok) return;
    const manifest = await response.json();
    const files = Array.isArray(manifest?.files) ? manifest.files : [];
    await Promise.all(
      files.map(async (asset) => {
        if (typeof asset !== 'string') return;
        const url = asset.startsWith('/') ? asset : `/${asset}`;
        try {
          const res = await fetch(url);
          if (res && res.ok) {
            const timestamped = await addTimestamp(res.clone(), 'static');
            await cache.put(url, timestamped);
          }
        } catch (error) {
          console.warn(`Service Worker: Failed to precache ${url}:`, error);
        }
      })
    );
  } catch (error) {
    console.warn('Service Worker: Failed to precache manifest assets:', error);
  }
}

// Helper function to invalidate specific cache
async function invalidateCache(cacheName) {
  try {
    const cache = await caches.open(cacheName);
    const requests = await cache.keys();
    await Promise.all(requests.map((request) => cache.delete(request)));
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
        .filter((name) => validPrefixes.some((prefix) => name.startsWith(prefix)))
        .map((name) => caches.delete(name))
    );
    console.log('All caches invalidated successfully');
  } catch (error) {
    console.error('Error invalidating all caches:', error);
    throw error; // Propagate error for proper handling in message response
  }
}

if (typeof module !== 'undefined') {
  module.exports = {
    isCacheFresh,
    addTimestamp,
    isNoStoreResponse,
    shouldSkipCache,
    invalidateCache,
    invalidateAllCaches,
    CACHE_CONFIG,
  };
}
