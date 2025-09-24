// Updated Content Security Policy injection
// This script writes a stricter Content Security Policy meta tag to the page
// header.  It removes the use of 'unsafe-inline' and 'unsafe-eval' for scripts
// and styles to mitigate cross‑site scripting risks while still permitting
// trusted third‑party domains.  If additional domains need to be allowed,
// they can be appended to the respective directives.

/*
 * Este script injerta una política de seguridad de contenidos (CSP) en la página.
 * Mantiene 'unsafe-inline' en script-src y style-src para permitir etiquetas
 * de Google Analytics y estilos inline necesarios, pero elimina 'unsafe-eval'
 * para reducir la superficie de ataque.  Si se necesitan más dominios de
 * confianza, se pueden añadir a las directivas correspondientes.
 */

(function () {
    // Generate a per-load nonce to allow safe inline style tags and JSON-LD
    function generateNonce() {
        try {
            const arr = new Uint8Array(16);
            (window.crypto || window.msCrypto).getRandomValues(arr);
            let str = '';
            for (let i = 0; i < arr.length; i++) str += String.fromCharCode(arr[i]);
            return btoa(str).replace(/\+/g, '-').replace(/\//g, '_');
        } catch {
            // Fallback (not cryptographically strong)
            return Math.random().toString(36).slice(2);
        }
    }
    const cspNonce = generateNonce();
    try { window.__CSP_NONCE__ = cspNonce; } catch {}

    const cspPolicy = `
        default-src 'self';
        script-src 'self' https://www.googletagmanager.com https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://static.cloudflareinsights.com 'nonce-${cspNonce}';
        style-src 'self' https://cdn.jsdelivr.net https://fonts.googleapis.com 'nonce-${cspNonce}';
        img-src 'self' data: https:;
        font-src 'self' https://fonts.gstatic.com https://cdn.jsdelivr.net;
        connect-src 'self' https://www.google-analytics.com https://analytics.google.com https://region1.google-analytics.com https://cloudflareinsights.com;
        frame-src 'none';
        object-src 'none';
        base-uri 'self';
        form-action 'self';
        upgrade-insecure-requests;
    `.replace(/\s+/g, ' ').trim();

    const meta = document.createElement('meta');
    meta.httpEquiv = 'Content-Security-Policy';
    meta.content = cspPolicy;
    document.head.appendChild(meta);

    // Flip deferred styles (data-defer) as early as possible to improve LCP.
    // Run in a microtask so we don't block the parser; enableDeferredStyles is hoisted.
    try {
        Promise.resolve().then(() => {
            try { if (typeof enableDeferredStyles === 'function') enableDeferredStyles(); } catch (e) {}
        });
    } catch (e) {
        // Fallback to direct call if Promise is unavailable
        try { if (typeof enableDeferredStyles === 'function') enableDeferredStyles(); } catch (_) {}
    }

    // Después de escribir la política CSP, definimos (o simulamos) funciones
    // de mejora. Algunas llamadas más abajo hacían referencia a funciones que
    // no existían, causando ReferenceError. Aquí agregamos implementaciones
    // mínimas y seguras para evitar errores en consola.

    function injectEnhancementStyles() {
        const styleEl = document.createElement('style');
        styleEl.setAttribute('nonce', cspNonce);
        styleEl.textContent = `
            /* Miniatura del carrito */
            .cart-item-thumb { width: 100px; height: 100px; flex-shrink: 0; }
            .cart-item-thumb img, .cart-item-thumb-img { width: 100%; height: 100%; object-fit: cover; border-radius: 0.25rem; }

            /* Cart item fallback minimal rules; Bootstrap will handle layout */
            .cart-item-content { min-width: 0; }
            .cart-item { flex-wrap: nowrap; }

            /* Eliminado: reglas de mega menú y anchura de los menús para restaurar el comportamiento predeterminado. */

            /* Contornos de enfoque claros para accesibilidad */
            .navbar .nav-link:focus,
            .navbar .dropdown-item:focus {
                outline: 2px solid var(--primary-color);
                outline-offset: 2px;
            }

                /* Reducir el espacio vertical entre botones del carrito.
                   Los botones utilizan la clase de Bootstrap mt-3 (margin-top),
                   así que se ajusta el margen superior para que queden más
                   juntos sin alterar el diseño general. */
                /* Ajustar el espacio vertical entre los botones del carrito.  En lugar de depender de
                   la clase mt-3 (que Bootstrap marca con !important), utilizamos un selector más
                   específico para aplicar el margen superior solamente a los botones que siguen
                   inmediatamente a otro botón dentro del cuerpo del offcanvas. */
                #cartOffcanvas .offcanvas-body > .btn + .btn {
                    margin-top: 0.5rem !important;
                }
        `;
        document.head.appendChild(styleEl);
    }

    // Mantiene en memoria un mapa de productos para búsqueda rápida.  Se
    // inicializa a null y se rellena la primera vez que se solicita.
    let productMap = null;

    /**
     * Carga los datos de productos desde el archivo JSON si aún no están en
     * memoria.  Devuelve un objeto mapeando id de producto a toda su
     * información, o null si la carga falla.
     */
    async function loadProductData() {
        if (productMap) return productMap;
        try {
            const version = localStorage.getItem('productDataVersion');
            const url = version ? `/data/product_data.json?v=${encodeURIComponent(version)}` : '/data/product_data.json';
            const response = await fetch(url, { cache: 'no-store', headers: { 'Accept': 'application/json' } });
            if (!response.ok) {
                console.error('Error al obtener product_data.json:', response.status);
                return null;
            }
            const data = await response.json();
            const arr = Array.isArray(data?.products) ? data.products : (Array.isArray(data) ? data : []);
            const map = {};
            arr.forEach(p => {
                // use provided id if exists, else build a stable key
                const key = p.id || (String(p.name) + "-" + String(p.category));
                map[key] = p;
            });
            productMap = map;
            return productMap;
        } catch (error) {
            console.error('Error al cargar datos de productos:', error);
            return null;
        }
    }

    /**
     * Genera e inserta datos estructurados Schema.org (primeros 20 productos)
     */
    async function injectStructuredData() {
        try {
            const map = await loadProductData();
            if (!map) return;
            const products = Object.values(map);
            const structuredProducts = products.slice(0, 20).map(p => ({
                '@type': 'Product',
                'name': p.name,
                'image': p.image_path,
                'description': p.description,
                'brand': p.brand || 'Genérico',
                'offers': {
                    '@type': 'Offer',
                    'price': p.price,
                    'priceCurrency': 'CLP',
                    'availability': p.stock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock'
                }
            }));
            const structuredData = {
                '@context': 'https://schema.org',
                '@graph': [
                    {
                        '@type': 'Store',
                        'name': 'El Rincón de Ébano',
                        'image': 'https://elrincondeebano.com/assets/images/web/logo.webp',
                        'description': 'Un minimarket en la puerta de tu departamento',
                        'address': { '@type': 'PostalAddress', 'addressCountry': 'CL' },
                        'telephone': '+56951118901',
                        'url': 'http://www.elrincondeebano.com/',
                        'contactPoint': {
                            '@type': 'ContactPoint',
                            'telephone': '+56-951118901',
                            'contactType': 'customer service'
                        }
                    },
                    ...structuredProducts
                ]
            };
            const scriptEl = document.createElement('script');
            scriptEl.type = 'application/ld+json';
            scriptEl.setAttribute('nonce', cspNonce);
            scriptEl.textContent = JSON.stringify(structuredData);
            document.head.appendChild(scriptEl);
        } catch (error) {
            console.error('Error generating structured data', error);
        }
    }

    // ---------- Implementaciones mínimas para evitar ReferenceError ----------

    // Paso/estado del checkout (no hay flujo de checkout multi‑paso hoy).
    function setupCheckoutProgress() {
        // No‑op seguro; deje un rastro para depuración.
        if (window?.console?.debug) console.debug('[csp] setupCheckoutProgress: no-op');
    }

    // Accesibilidad básica de navegación (teclas y foco).
    function setupNavigationAccessibility() {
        try {
            // Añade indicadores de foco al navegar con teclado.
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Tab') document.body.classList.add('keyboard-navigation');
            });
            document.addEventListener('mousedown', () => {
                document.body.classList.remove('keyboard-navigation');
            });

            const style = document.createElement('style');
            style.setAttribute('nonce', cspNonce);
            style.textContent = `.keyboard-navigation *:focus { outline: 2px solid var(--primary-color); outline-offset: 2px; }`;
            document.head.appendChild(style);
        } catch (e) {
            console.warn('[csp] setupNavigationAccessibility error:', e);
        }
    }

    // Optimizaciones ligeras de rendimiento.
    function setupPerformanceOptimizations() {
        try {
            // Lazy-load para imágenes si el navegador lo soporta.
            if ('loading' in HTMLImageElement.prototype) {
                document.querySelectorAll('img:not([loading])').forEach(img => {
                    img.loading = 'lazy';
                });
            }
        } catch (e) {
            console.warn('[csp] setupPerformanceOptimizations error:', e);
        }
    }

    // Inyección mínima de metadatos SEO si faltan.
    function injectSeoMetadata() {
        try {
            // Asegura etiqueta canonical si no existe.
            if (!document.querySelector('link[rel="canonical"]')) {
                const link = document.createElement('link');
                link.rel = 'canonical';
                link.href = location.origin + location.pathname;
                document.head.appendChild(link);
            }
            // Evita duplicar description si ya está presente en el HTML.
            // Si falta, añade una genérica.
            if (!document.querySelector('meta[name="description"]')) {
                const meta = document.createElement('meta');
                meta.name = 'description';
                meta.content = 'El Rincón de Ébano - Minimarket con delivery instantáneo.';
                document.head.appendChild(meta);
            }
        } catch (e) {
            console.warn('[csp] injectSeoMetadata error:', e);
        }
    }

    // Inyecta el manifest de la PWA si no está presente.
    function injectPwaManifest() {
        try {
            if (!document.querySelector('link[rel="manifest"]')) {
                const link = document.createElement('link');
                link.rel = 'manifest';
                link.href = '/app.webmanifest';
                document.head.appendChild(link);
            }
        } catch (e) {
            console.warn('[csp] injectPwaManifest error:', e);
        }
    }

    // Habilita estilos diferidos sin usar onload inline en <link> y evita forzar
    // reprocesamientos durante el render inicial programando el cambio de media.
    let deferredStylesScheduled = false;

    function applyDeferredStyles() {
        try {
            const links = document.querySelectorAll('link[rel="stylesheet"][media="print"][data-defer]');
            links.forEach(link => {
                if (link.media === 'all') {
                    return;
                }
                link.media = 'all';
                link.removeAttribute('data-defer');
            });
        } catch (e) {
            console.warn('[csp] enableDeferredStyles error:', e);
        }
    }

    function enableDeferredStyles() {
        if (deferredStylesScheduled) {
            return;
        }
        deferredStylesScheduled = true;

        const run = () => {
            try {
                applyDeferredStyles();
            } catch (e) {
                console.warn('[csp] deferred style application failed:', e);
            }
        };

        const idle = typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function'
            ? window.requestIdleCallback
            : null;
        if (idle) {
            idle(run, { timeout: 1500 });
            return;
        }

        const raf = typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function'
            ? window.requestAnimationFrame
            : null;
        if (raf) {
            raf(() => setTimeout(run, 0));
            return;
        }

        setTimeout(run, 0);
    }

    // Inicializa todas las mejoras cuando el DOM esté listo.
    // Con guardia para evitar ejecuciones duplicadas si un bundle ESM también inicializa.
    document.addEventListener('DOMContentLoaded', () => {
        // Asegura que los estilos diferidos siempre se activen, incluso si
        // otro bundle ya marcó la inicialización.
        enableDeferredStyles();

        const root = document.documentElement;
        if (root.dataset.enhancementsInit === '1') return;
        root.dataset.enhancementsInit = '1';
        injectEnhancementStyles();
        setupCheckoutProgress();
        setupNavigationAccessibility();
        setupPerformanceOptimizations();
        injectSeoMetadata();
        injectStructuredData();
        injectPwaManifest();
    });
})();



