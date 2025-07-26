// Cart enhancements: add product thumbnails and show progress indicator on checkout
// This script runs after DOM is loaded and attaches listeners to cart interactions.

/**
 * UI enhancements module.  Splitting functionality into named functions improves
 * maintainability and makes it easier to extend or debug individual features.
 */

function injectEnhancementStyles() {
    const styleEl = document.createElement('style');
    styleEl.textContent = `
        /* Cart enhancement: thumbnail image style */
        .cart-item-thumb {
            width: 40px;
            height: 40px;
            object-fit: cover;
            border-radius: 0.25rem;
            margin-right: 0.5rem;
        }

        /* Navigation enhancement: mega menu and responsive dropdown */
        @media (min-width: 992px) {
            .navbar .dropdown-menu {
                width: 400px;
                display: grid;
                grid-template-columns: repeat(2, 1fr);
                column-gap: 1rem;
            }
        }
        @media (max-width: 991.98px) {
            .navbar .dropdown-menu {
                width: 100%;
            }
        }

        /* Accessibility enhancement: show clear focus outlines on navigation links */
        .navbar .nav-link:focus,
        .navbar .dropdown-item:focus {
            outline: 2px solid var(--primary-color);
            outline-offset: 2px;
        }
    `;
    document.head.appendChild(styleEl);
}

function addThumbnailsToCart() {
    const cartItemsContainer = document.getElementById('cart-items');
    if (!cartItemsContainer) return;
    const cartData = JSON.parse(localStorage.getItem('cart') || '[]');
    cartItemsContainer.querySelectorAll('.cart-item').forEach(itemEl => {
        const removeBtn = itemEl.querySelector('.remove-item');
        const productId = removeBtn ? removeBtn.getAttribute('data-id') : null;
        if (!productId) return;
        if (!itemEl.querySelector('img.cart-item-thumb')) {
            const product = cartData.find(p => String(p.id) === String(productId));
            if (product && product.image_path) {
                const img = document.createElement('img');
                img.src = product.image_path;
                img.alt = product.name;
                img.className = 'cart-item-thumb me-2';
                itemEl.insertBefore(img, itemEl.firstChild);
            }
        }
    });
}

function setupCartThumbnailListener() {
    const cartIcon = document.getElementById('cart-icon');
    if (cartIcon) {
        cartIcon.addEventListener('click', () => {
            setTimeout(() => {
                addThumbnailsToCart();
            }, 100);
        });
    }
}

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
}

function setupPerformanceOptimizations() {
    // Preconnect to Google Fonts domains
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
    // Preload critical CSS and main stylesheet
    const cssFiles = [
        '/assets/css/critical.min.css',
        '/assets/css/style.min.css'
    ];
    cssFiles.forEach(href => {
        const link = document.createElement('link');
        link.rel = 'preload';
        link.href = href;
        link.as = 'style';
        link.onload = function() {
            this.rel = 'stylesheet';
        };
        document.head.appendChild(link);
    });
}

/**
 * Insert or update basic SEO metadata such as the page title and meta
 * description.  Keeping these values in Spanish mejora el posicionamiento
 * de la tienda en los buscadores y asegura que la información sea clara
 * para los clientes locales.
 */
function injectSeoMetadata() {
    // Update the document title with a descriptive phrase
    document.title = 'El Rincón de Ébano - Tienda en línea de productos gourmet y bebidas';

    // Ensure there is a meta description element and set its content
    let metaDesc = document.querySelector('meta[name="description"]');
    if (!metaDesc) {
        metaDesc = document.createElement('meta');
        metaDesc.setAttribute('name', 'description');
        document.head.appendChild(metaDesc);
    }
    metaDesc.setAttribute('content', 'El Rincón de Ébano: tienda online con bebestibles, snacks, alimentos y más. Delivery instantáneo en Santiago.');
}

/**
 * Generate and inject Schema.org JSON‑LD structured data for the store and
 * products.  The function fetches the existing product data from the API
 * endpoint used by the main script and builds a graph including the Store
 * and a subset of products with their offers.  If the fetch fails, the
 * function fails silently and logs an error in the console.
 */
async function injectStructuredData() {
    try {
        const response = await fetch('/_products/product_data.json');
        if (!response.ok) return;
        const products = await response.json();
        // Map products to structured data objects (limit to first 20 to reduce size)
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
                    'url': window.location.origin,
                    'logo': '/assets/images/logo.png',
                    'address': {
                        '@type': 'PostalAddress',
                        'addressLocality': 'Santiago',
                        'addressCountry': 'CL'
                    }
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

// Initialize all enhancements on DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
    injectEnhancementStyles();
    setupCartThumbnailListener();
    setupCheckoutProgress();
    setupNavigationAccessibility();
    setupPerformanceOptimizations();
    // Inject SEO metadata and structured data after performance optimizations
    injectSeoMetadata();
    injectStructuredData();
});
