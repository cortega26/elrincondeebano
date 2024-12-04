// Service Worker optimizado para GitHub Pages
const CONFIG = {
    cacheNames: {
      static: 'el-rincon-de-ebano-static-v3',
      dynamic: 'el-rincon-de-ebano-dynamic-v2', 
      products: 'el-rincon-de-ebano-products-v2',
      images: 'el-rincon-de-ebano-images-v1'
    },
    cacheDuration: {
      static: 12 * 60 * 60 * 1000,    // 12 horas para GitHub Pages
      dynamic: 2 * 60 * 60 * 1000,    // 2 horas para GitHub Pages
      products: 5 * 60 * 1000,        // 5 minutos
      images: 24 * 60 * 60 * 1000     // 24 horas
    },
    // Adjusted paths for GitHub Pages
    staticAssets: [
      './index.html',
      './404.html',
      './offline.html',
      './assets/css/style.css',
      './assets/css/critical.css',
      './assets/js/script.js',
      './assets/images/web/logo.webp',
      './assets/images/web/favicon.ico',
      './assets/images/web/placeholder.webp'
    ],
    gitHubPages: {
      hostname: 'www.elrincondeebano.com',
      repository: 'elrincondeebano',
      fetchTimeout: 8000,
      maxRetries: 3,
      retryDelay: 1000
    }
  };

// Helper function to resolve paths
function resolveUrl(url) {
    const baseUrl = self.registration.scope;
    return new URL(url, baseUrl).href;
  }

// Función mejorada para verificar frescura del caché
const isCacheFresh = (response, type = 'static') => {
    if (!response || !response.headers) return false;
    
    const timestamp = response.headers.get('sw-timestamp');
    if (!timestamp) return false;

    const age = Date.now() - parseInt(timestamp);
    return age < CONFIG.cacheDuration[type];
};

// Función mejorada para agregar marca de tiempo a la respuesta
const addTimestamp = async (response, type = 'static') => {
    const clone = response.clone();
    const headers = new Headers(clone.headers);
    headers.append('sw-timestamp', Date.now().toString());
    headers.append('cache-type', type);
    
    try {
        const blob = await clone.blob();
        return new Response(blob, {
            status: clone.status,
            statusText: clone.statusText,
            headers: headers
        });
    } catch (error) {
        console.error('Error al clonar respuesta:', error);
        return response;
    }
};

// Evento de instalación mejorado
self.addEventListener('install', (event) => {
    event.waitUntil(
      caches.open(CONFIG.cacheNames.static)
        .then(async (cache) => {
          console.log('Iniciando almacenamiento en caché...');
          
          // Resolve and validate each URL before caching
          const urlsToCache = CONFIG.staticAssets.map(path => resolveUrl(path));
          
          // Cache resources individually to handle failures gracefully
          const cachePromises = urlsToCache.map(async url => {
            try {
              const response = await fetch(url, { 
                credentials: 'same-origin',
                mode: 'cors'
              });
              if (response.ok) {
                await cache.put(url, response);
                console.log(`Recurso almacenado en caché: ${url}`);
              } else {
                console.warn(`No se pudo almacenar en caché: ${url} - Estado: ${response.status}`);
              }
            } catch (error) {
              console.error(`Error al almacenar en caché: ${url}`, error);
              // Continue with other resources even if one fails
            }
          });
  
          await Promise.allSettled(cachePromises);
          console.log('Proceso de caché completado');
        })
        .then(() => self.skipWaiting())
        .catch(error => {
          console.error('Error durante la instalación:', error);
          // Continue installation even if caching fails
          return self.skipWaiting();
        })
    );
  });

// Evento de activación mejorado
self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        try {
            // Tomar control inmediatamente
            await self.clients.claim();
            
            // Limpiar cachés antiguos
            const cacheNames = await caches.keys();
            await Promise.all(
                cacheNames
                    .filter((name) => name.startsWith('el-rincon-de-ebano-'))
                    .filter((name) => !Object.values(CONFIG.cacheNames).includes(name))
                    .map(async (name) => {
                        console.log(`Eliminando caché antiguo: ${name}`);
                        await caches.delete(name);
                    })
            );
            
            console.log('Service Worker activado y controlando la página');
        } catch (error) {
            console.error('Error durante la activación:', error);
            throw error;
        }
    })());
});

// Manejo mejorado de datos de productos
async function handleProductDataFetch(request) {
    try {
        // Intentar red primero con opciones mejoradas
        const networkResponse = await fetchWithRetry(request, 0, {
            cache: 'reload',
            credentials: 'same-origin',
            headers: {
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache'
            }
        });
        
        if (networkResponse.ok) {
            const cache = await caches.open(CONFIG.cacheNames.products);
            const timestampedResponse = await addTimestamp(networkResponse.clone(), 'products');
            await cache.put(request, timestampedResponse);
            return networkResponse;
        }
    } catch (error) {
        console.log('Error en la red, intentando caché:', error);
    }

    // El resto de la función permanece igual...
    const cachedResponse = await caches.match(request);
    if (cachedResponse && isCacheFresh(cachedResponse, 'products')) {
        console.log('Sirviendo datos de productos desde caché fresco');
        return cachedResponse;
    }

    try {
        const networkResponse = await fetchWithRetry(request);
        if (networkResponse.ok) {
            const cache = await caches.open(CONFIG.cacheNames.products);
            const timestampedResponse = await addTimestamp(networkResponse.clone(), 'products');
            await cache.put(request, timestampedResponse);
            return networkResponse;
        }
    } catch (error) {
        console.log('Falló la red y el caché:', error);
        if (cachedResponse) {
            console.log('Usando caché obsoleto como último recurso');
            return cachedResponse;
        }
    }

    throw new Error('No se pudieron obtener los datos de productos');
}

// Función fetchWithRetry mejorada
async function fetchWithRetry(request, retryCount = 0, options = {}) {
    try {
        const response = await Promise.race([
            fetch(request, {
                ...options,
                mode: 'cors',
                credentials: 'same-origin'
            }),
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Tiempo de espera agotado')), CONFIG.gitHubPages.fetchTimeout)
            )
        ]);

        if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
        return response;
    } catch (error) {
        if (retryCount >= CONFIG.gitHubPages.maxRetries) throw error;
        
        const delay = CONFIG.gitHubPages.retryDelay * Math.pow(2, retryCount);
        await new Promise(resolve => setTimeout(resolve, delay));
        
        console.log(`Reintentando solicitud (${retryCount + 1}/${CONFIG.gitHubPages.maxRetries})`);
        return fetchWithRetry(request, retryCount + 1, options);
    }
}

// Manejo de recursos estáticos
async function handleStaticAssetFetch(request) {
    const cachedResponse = await caches.match(request);
    if (cachedResponse && isCacheFresh(cachedResponse, 'static')) {
        return cachedResponse;
    }

    try {
        const networkResponse = await fetchWithRetry(request);
        if (networkResponse.ok) {
            const cache = await caches.open(CONFIG.cacheNames.static);
            const timestampedResponse = await addTimestamp(networkResponse.clone(), 'static');
            await cache.put(request, timestampedResponse);
            return networkResponse;
        }
    } catch (error) {
        if (cachedResponse) return cachedResponse;
        console.error('Error al obtener recurso estático:', error);
        return handleOfflineFallback(request);
    }
}

// Manejo de contenido dinámico
async function handleDynamicFetch(request) {
    if (request.method !== 'GET') {
        return fetch(request);
    }

    try {
        const networkResponse = await fetchWithRetry(request);
        if (networkResponse.ok) {
            const cache = await caches.open(CONFIG.cacheNames.dynamic);
            const timestampedResponse = await addTimestamp(networkResponse.clone(), 'dynamic');
            await cache.put(request, timestampedResponse);
            return networkResponse;
        }
    } catch (error) {
        const cachedResponse = await caches.match(request);
        if (cachedResponse) return cachedResponse;
        
        if (request.url.match(/\.(jpg|jpeg|png|gif|webp)$/)) {
            return handleImageFallback();
        }

        return handleOfflineFallback(request);
    }
}

// Manejadores de respaldo
async function handleImageFallback() {
    return caches.match('/assets/images/web/placeholder.webp');
}

async function handleOfflineFallback(request) {
    if (request.headers.get('Accept').includes('text/html')) {
        return caches.match('/offline.html');
    }
    throw new Error('Recurso no disponible sin conexión');
}

// Evento principal de fetch
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    
    // Ignorar peticiones de browser-sync durante desarrollo
    if (url.hostname.includes('browser-sync')) {
        return;
    }

    // Manejar datos de productos
    if (url.pathname.includes('product_data.json')) {
        event.respondWith(handleProductDataFetch(event.request));
        return;
    }

    // Manejar recursos estáticos
    if (CONFIG.staticAssets.includes(url.pathname)) {
        event.respondWith(handleStaticAssetFetch(event.request));
        return;
    }

    // Manejar otras peticiones
    event.respondWith(handleDynamicFetch(event.request));
});

// Manejo de mensajes
self.addEventListener('message', (event) => {
    if (event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    } else if (event.data.type === 'INVALIDATE_PRODUCT_CACHE') {
        invalidateCache(CONFIG.cacheNames.products);
    } else if (event.data.type === 'INVALIDATE_ALL_CACHES') {
        invalidateAllCaches();
    }
});

// Función para invalidar caché específico
async function invalidateCache(cacheName) {
    try {
        const cache = await caches.open(cacheName);
        const requests = await cache.keys();
        await Promise.all(requests.map(request => cache.delete(request)));
        console.log(`Caché ${cacheName} invalidado exitosamente`);
    } catch (error) {
        console.error(`Error al invalidar caché ${cacheName}:`, error);
    }
}

// Función para invalidar todos los cachés
async function invalidateAllCaches() {
    try {
        const cacheNames = await caches.keys();
        await Promise.all(
            cacheNames
                .filter(name => name.startsWith('el-rincon-de-ebano-'))
                .map(name => caches.delete(name))
        );
        console.log('Todos los cachés invalidados exitosamente');
    } catch (error) {
        console.error('Error al invalidar todos los cachés:', error);
    }
}