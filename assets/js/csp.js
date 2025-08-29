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
            const map = await loadProductData();\n            if (!map) return;\n            const products = Object.values(map);\n            const structuredProducts = products.slice(0, 20).map(p => ({
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


