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
    const cspPolicy = `
        default-src 'self';
        script-src 'self' https://www.googletagmanager.com https://code.jquery.com https://cdn.jsdelivr.net https://cdnjs.cloudflare.com data: 'unsafe-inline';
        style-src 'self' https://cdn.jsdelivr.net https://fonts.googleapis.com 'unsafe-inline';
        img-src 'self' data: https:;
        font-src 'self' https://fonts.gstatic.com https://cdn.jsdelivr.net;
        connect-src 'self' https://www.google-analytics.com;
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

    // Después de escribir la política CSP, definimos todas las funciones de
    // mejora de la interfaz, accesibilidad, SEO y PWA directamente en este
    // script.  Esto evita tener que cargar archivos adicionales desde
    // index.html o depender de la caché del service worker.  Cada función
    // está documentada en español para mantener la claridad.

    function injectEnhancementStyles() {
        const styleEl = document.createElement('style');
        styleEl.textContent = `
            /* Miniatura del carrito */
            .cart-item-thumb {
                width: 40px;
                height: 40px;
                object-fit: cover;
                border-radius: 0.25rem;
                margin-right: 0.5rem;
            }

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
            const response = await fetch('/_products/product_data.json');
            if (!response.ok) {
                console.error('Error al obtener product_data.json:', response.status);
                return null;
            }
            const data = await response.json();
            productMap = {};
            data.products.forEach(p => {
                productMap[p.id] = p;
            });
            return productMap;
        } catch (error) {
            console.error('Error al cargar datos de productos:', error);
            return null;
        }
    }

    /**
     * Muestra un indicador de progreso cuando se envía el pedido por WhatsApp.
     * Deshabilita temporalmente el botón para evitar envíos múltiples.
     */
    function setupCheckoutProgress() {
        const submitBtn = document.getElementById('submit-cart');
        if (submitBtn) {
            submitBtn.addEventListener('click', () => {
                const originalText = submitBtn.textContent;
                submitBtn.disabled = true;
                submitBtn.textContent = 'Enviando…';
                setTimeout(() => {
                    submitBtn.disabled = false;
                    submitBtn.textContent = originalText;
                }, 2000);
            });
        }
    }

    /**
     * Añade atributos ARIA a la barra de navegación y a los menús para
     * mejorar la accesibilidad del sitio.
     */
    function setupNavigationAccessibility() {
        const nav = document.querySelector('nav.navbar');
        if (nav) {
            nav.setAttribute('role', 'navigation');
            nav.setAttribute('aria-label', 'Navegación principal');
        }
        document.querySelectorAll('.navbar .dropdown-menu').forEach(menu => {
            menu.setAttribute('role', 'menu');
            menu.setAttribute('aria-label', 'Subcategorías');
        });
        document.querySelectorAll('.navbar .dropdown-menu .dropdown-item').forEach(item => {
            item.setAttribute('role', 'menuitem');
        });

        // Restaurar el comportamiento de menú predeterminado sin aplicar un mega menú personalizado.
    }

    /**
     * Preconecta dominios de fuentes y precarga hojas de estilo críticas para
     * mejorar el rendimiento inicial de la página.
     */
    function setupPerformanceOptimizations() {
        const fontDomains = [
            { href: 'https://fonts.googleapis.com' },
            { href: 'https://fonts.gstatic.com', crossOrigin: '' }
        ];
        fontDomains.forEach(({ href, crossOrigin }) => {
            const link = document.createElement('link');
            link.rel = 'preconnect';
            link.href = href;
            if (crossOrigin !== undefined) link.crossOrigin = crossOrigin;
            document.head.appendChild(link);
        });
        const cssFiles = [
            '/assets/css/critical.min.css',
            '/assets/css/style.min.css'
        ];
        cssFiles.forEach(href => {
            const link = document.createElement('link');
            link.rel = 'preload';
            link.href = href;
            link.as = 'style';
            link.onload = function () {
                this.rel = 'stylesheet';
            };
            document.head.appendChild(link);
        });
    }

    /**
     * Inyecta el enlace al manifiesto PWA de la tienda, permitiendo que los
     * usuarios instalen la aplicación en sus dispositivos.
     */
    function injectPwaManifest() {
        if (document.querySelector('link[rel="manifest"]')) return;
        const link = document.createElement('link');
        link.rel = 'manifest';
        link.href = '/app.webmanifest';
        document.head.appendChild(link);
    }

    /**
     * Actualiza el título y la descripción de la página para mejorar el SEO.
     */
    function injectSeoMetadata() {
        document.title = 'El Rincón de Ébano - Tienda en línea de productos gourmet y bebidas';
        let metaDesc = document.querySelector('meta[name="description"]');
        if (!metaDesc) {
            metaDesc = document.createElement('meta');
            metaDesc.setAttribute('name', 'description');
            document.head.appendChild(metaDesc);
        }
        metaDesc.setAttribute('content', 'El Rincón de Ébano: tienda online con bebestibles, snacks, alimentos y más. Delivery instantáneo en Santiago.');
    }

    /**
     * Genera e inserta datos estructurados Schema.org para la tienda y los
     * productos (limitado a los primeros 20) para mejorar la visibilidad en
     * buscadores.
     */
    async function injectStructuredData() {
        try {
            const response = await fetch('/_products/product_data.json');
            if (!response.ok) return;
            const products = await response.json();
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
                    'availability': p.stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock'
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
                        'address': {
                            '@type': 'PostalAddress',
                            'addressCountry': 'CL'
                        },
                        'telephone': '+56951118901',
                        'url': 'http://www.elrincondeebano.com/'
                    },
                    ...structuredProducts
                ]
            };
            const scriptEl = document.createElement('script');
            scriptEl.type = 'application/ld+json';
            scriptEl.textContent = JSON.stringify(structuredData);
            document.head.appendChild(scriptEl);
        } catch (error) {
            console.error('Error generating structured data', error);
        }
    }

    // Inicializa todas las mejoras cuando el DOM esté listo
    document.addEventListener('DOMContentLoaded', () => {
        injectEnhancementStyles();
        setupCheckoutProgress();
        setupNavigationAccessibility();
        setupPerformanceOptimizations();
        injectSeoMetadata();
        injectStructuredData();
        injectPwaManifest();
    });
})();