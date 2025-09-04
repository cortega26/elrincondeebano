/**
 * Enhanced JavaScript for El Rincón de Ébano
 * Modern UX/UI improvements and animations + Core Loading Functionality
 */

import { cfimg, CFIMG_THUMB } from './utils/cfimg.mjs';

// Core loading functionality
const coreLoader = {
    // Load navbar and footer
    loadComponents: async () => {
        const navbarContainer = document.getElementById('navbar-container');
        const footerContainer = document.getElementById('footer-container');

        if (!navbarContainer || !footerContainer) {
            console.error('Navbar or footer container not found');
            return;
        }

        try {
            await Promise.all([
                coreLoader.loadComponent(navbarContainer, '/pages/navbar.html'),
                coreLoader.loadComponent(footerContainer, '/pages/footer.html')
            ]);
            console.log('Navbar and footer loaded successfully');
        } catch (error) {
            console.error('Error loading components:', error);
        }
    },

    // Generic component loader (CSP-safe: strips inline scripts, re-adds JSON-LD with nonce)
    loadComponent: async (container, filename) => {
        if (!container) {
            console.warn(`Container not found for component: ${filename}`);
            return;
        }

        try {
            const response = await fetch(filename);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const html = await response.text();

            // Parse and strip inline scripts to satisfy CSP
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            const ldJsonBlocks = [];
            doc.querySelectorAll('script').forEach(scr => {
                if (scr.type === 'application/ld+json') {
                    ldJsonBlocks.push(scr.textContent);
                }
                scr.remove();
            });

            container.innerHTML = doc.body ? doc.body.innerHTML : html;

            // Post-process: current year helper (replaces removed inline script)
            const yearEl = container.querySelector('#current-year');
            if (yearEl) yearEl.textContent = new Date().getFullYear();

            // Re-inject JSON-LD blocks with nonce
            if (ldJsonBlocks.length) {
                const nonce = (typeof window !== 'undefined' && window.__CSP_NONCE__) ? window.__CSP_NONCE__ : null;
                ldJsonBlocks.forEach(text => {
                    try {
                        const s = document.createElement('script');
                        s.type = 'application/ld+json';
                        if (nonce) s.setAttribute('nonce', nonce);
                        s.textContent = text;
                        // Append near container to keep semantics; head is also valid
                        container.appendChild(s);
                    } catch {}
                });
            }
        } catch (error) {
            console.error("Error loading component:", { component: filename, message: error.message });
            container.innerHTML = `<div class="alert alert-danger">Error loading ${filename}</div>`;
        }
    },

    // Load products from JSON
    loadProducts: async () => {
        const productContainer = document.getElementById('product-container');
        if (!productContainer) {
            console.error('Product container not found');
            return [];
        }

        try {
            const version = localStorage.getItem('productDataVersion');
            const url = version ? `/_products/product_data.json?v=${encodeURIComponent(version)}` : '/_products/product_data.json';
            const response = await fetch(url, { cache: 'no-store', headers: { 'Accept': 'application/json' } });
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const data = await response.json();

            let products = data.products || [];

            // Add stable IDs and sanitize
            products = products.map(product => ({
                ...product,
                id: coreLoader.generateStableId(product),
                name: coreLoader.sanitizeHTML(product.name),
                description: coreLoader.sanitizeHTML(product.description),
                category: coreLoader.sanitizeHTML(product.category)
            }));

            return products;
        } catch (error) {
            console.error('Error loading products:', error);
            productContainer.innerHTML = '<div class="alert alert-danger">Error loading products</div>';
            return [];
        }
    },

    // Utility functions
    generateStableId: (product) => {
        const baseString = `${product.name}-${product.category}`.toLowerCase();
        let hash = 0;
        for (let i = 0; i < baseString.length; i++) {
            const char = baseString.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return `pid-${Math.abs(hash)}`;
    },

    sanitizeHTML: (unsafe) => {
        const element = document.createElement('div');
        element.textContent = unsafe;
        return element.innerHTML;
    }
};

// Enhanced utility functions
const enhancedUtils = {
    normalize: (str) => {
        if (!str) return '';
        try {
            return String(str)
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/\s+/g, '')
                .toLowerCase();
        } catch {
            return String(str).toLowerCase();
        }
    },
    smoothScroll: (element, offset = 0) => {
        const elementPosition = element.offsetTop - offset;
        window.scrollTo({
            top: elementPosition,
            behavior: 'smooth'
        });
    },

    debounce: (func, delay) => {
        let timeoutId;
        return (...args) => {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => func.apply(this, args), delay);
        };
    },

    isInViewport: (element) => {
        const rect = element.getBoundingClientRect();
        return (
            rect.top >= 0 &&
            rect.left >= 0 &&
            rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
            rect.right <= (window.innerWidth || document.documentElement.clientWidth)
        );
    }
};

// Enhanced product animations
const productAnimations = {
    init: () => {
        const products = document.querySelectorAll('.producto');
        products.forEach((product, index) => {
            product.style.animationDelay = `${index * 0.1}s`;
            product.classList.add('fade-in-up');

            product.addEventListener('mouseenter', () => {
                productAnimations.onHover(product);
            });

            product.addEventListener('mouseleave', () => {
                productAnimations.onLeave(product);
            });
        });
    },

    onHover: (product) => {
        const img = product.querySelector('img');
        const card = product.querySelector('.card');

        if (img) img.style.transform = 'scale(1.05)';
        if (card) card.style.transform = 'translateY(-8px)';
    },

    onLeave: (product) => {
        const img = product.querySelector('img');
        const card = product.querySelector('.card');

        if (img) img.style.transform = 'scale(1)';
        if (card) card.style.transform = 'translateY(0)';
    }
};

// Enhanced search functionality
const enhancedSearch = {
    init: () => {
        const searchInput = document.getElementById('filter-keyword');
        const sortSelect = document.getElementById('sort-options');

        if (searchInput) {
            searchInput.addEventListener('input',
                enhancedUtils.debounce(enhancedSearch.handleSearch, 300)
            );
        }

        if (sortSelect) {
            sortSelect.addEventListener('change', enhancedSearch.handleSort);
        }
    },

    handleSearch: (event) => {
        const query = event.target.value.toLowerCase().trim();
        const productContainer = document.getElementById('product-container');

        if (query.length > 0) {
            enhancedLoading.show(productContainer);
            setTimeout(() => {
                enhancedSearch.filterProducts(query);
                enhancedLoading.hide(productContainer);
            }, 300);
        } else {
            enhancedSearch.filterProducts(query);
        }
    },

    handleSort: () => {
        const sortValue = document.getElementById('sort-options').value;
        const productContainer = document.getElementById('product-container');

        enhancedLoading.show(productContainer);
        setTimeout(() => {
            enhancedSearch.sortProducts(sortValue);
            enhancedLoading.hide(productContainer);
        }, 300);
    },

    filterProducts: (query) => {
        const allProducts = window.appState?.products || [];
        const productContainer = document.getElementById('product-container');

        if (!productContainer) return;

        const filtered = allProducts.filter(product => {
            const title = product.name?.toLowerCase() || '';
            const description = product.description?.toLowerCase() || '';
            return title.includes(query) || description.includes(query);
        });

        renderProducts(filtered);
    },

    sortProducts: (sortValue) => {
        const allProducts = window.appState?.products || [];

        const sorted = [...allProducts].sort((a, b) => {
            switch (sortValue) {
                case 'name-asc':
                    return a.name.localeCompare(b.name);
                case 'name-desc':
                    return b.name.localeCompare(a.name);
                case 'price-asc':
                    return a.price - b.price;
                case 'price-desc':
                    return b.price - a.price;
                default:
                    return 0;
            }
        });

        renderProducts(sorted);
    }
};

// Enhanced loading states
const enhancedLoading = {
    show: (container) => {
        if (!container) return;
        container.innerHTML = `
            <div class="loading-container">
                <div class="loading-skeleton"></div>
                <div class="loading-skeleton"></div>
                <div class="loading-skeleton"></div>
                <div class="loading-skeleton"></div>
            </div>
        `;
    },

    hide: (container) => {
        if (!container) return;
        const loadingElements = container.querySelectorAll('.loading-skeleton');
        loadingElements.forEach(el => el.remove());
    }
};

// Helpers for cart state (localStorage-backed)
const readCart = () => {
    try {
        const raw = localStorage.getItem('cart');
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
};

const writeCart = (cart) => {
    try {
        localStorage.setItem('cart', JSON.stringify(cart));
    } catch {}
    // mirror to appState if present
    if (window.appState) window.appState.cart = cart;
    const badge = document.getElementById('cart-count');
    if (badge) {
        const total = cart.reduce((s, it) => s + (Number(it.quantity) || 0), 0);
        badge.textContent = String(total);
        badge.setAttribute('aria-label', `${total} items in cart`);
    }
};

const getCartQuantityById = (productId) => {
    const cart = readCart();
    const item = cart.find(i => i.id === productId);
    return item ? Number(item.quantity) || 0 : 0;
};

const updateCartQuantity = (productId, newQty) => {
    let cart = readCart();
    const idx = cart.findIndex(i => i.id === productId);
    if (newQty <= 0) {
        if (idx !== -1) cart.splice(idx, 1);
    } else {
        if (idx !== -1) {
            cart[idx].quantity = newQty;
        } else {
            const prod = (window.appState?.products || []).find(p => p.id === productId);
            if (prod) cart.push({ ...prod, quantity: newQty });
        }
    }
    writeCart(cart);
    updateProductCardState(productId);
};

const updateProductCardState = (productId) => {
    const wrapper = document.querySelector(`.cart-controls[data-product-id="${productId}"]`);
    if (!wrapper) return;
    const addBtn = wrapper.querySelector('.add-to-cart-btn');
    const qtyBox = wrapper.querySelector('.quantity-controls');
    const input = wrapper.querySelector('.quantity-input');
    const qty = getCartQuantityById(productId);
    if (qty > 0) {
        if (input) input.value = qty;
        addBtn?.classList.add('d-none');
        qtyBox?.classList.remove('d-none');
    } else {
        qtyBox?.classList.add('d-none');
        addBtn?.classList.remove('d-none');
    }
};

// Product rendering function
const renderProducts = (products) => {
    const productContainer = document.getElementById('product-container');
    if (!productContainer) return;

    if (products.length === 0) {
        productContainer.innerHTML = '<div class="alert alert-info">No products found</div>';
        return;
    }

    const fragment = document.createDocumentFragment();

    products.forEach((product, index) => {
        const productElement = document.createElement('div');
        productElement.className = 'producto col-12 col-sm-6 col-md-4 col-lg-3 mb-4';
        productElement.style.animationDelay = `${index * 0.1}s`;

        const discountedPrice = product.price - (product.discount || 0);

        productElement.innerHTML = `
            <div class="card h-100">
                <img
                  class="product-thumb card-img-top"
                  src="${cfimg(product.image_path, { ...CFIMG_THUMB, width: 400 })}"
                  srcset="
                    ${cfimg(product.image_path, { ...CFIMG_THUMB, width: 200 })} 200w,
                    ${cfimg(product.image_path, { ...CFIMG_THUMB, width: 400 })} 400w,
                    ${cfimg(product.image_path, { ...CFIMG_THUMB, width: 800 })} 800w
                  "
                  sizes="(max-width: 640px) 200px, 400px"
                  width="400" height="400"
                  loading="lazy" decoding="async"
                >
                <div class="card-body d-flex flex-column">
                    <h5 class="card-title">${product.name}</h5>
                    <p class="card-text flex-grow-1">${product.description}</p>
                    <div class="mt-auto">
                        <div class="price-container">
                            ${product.discount ? `
                                <span class="text-danger fw-bold">$${discountedPrice.toLocaleString()}</span>
                                <span class="text-muted text-decoration-line-through">$${product.price.toLocaleString()}</span>
                            ` : `
                                <span class="fw-bold">$${product.price.toLocaleString()}</span>
                            `}
                        </div>
                        <div class="cart-controls mt-2" data-product-id="${product.id}">
                            <button class="btn btn-primary add-to-cart-btn w-100" data-product-id="${product.id}" aria-label="Agregar ${product.name} al carrito">
                                Agregar al carrito
                            </button>
                            <div class="quantity-controls d-none mt-2" role="group" aria-label="Cantidad para ${product.name}">
                                <button class="btn btn-outline-secondary btn-sm decrease-qty" aria-label="Disminuir">-</button>
                                <input type="number" class="form-control form-control-sm quantity-input mx-2" data-product-id="${product.id}" value="1" min="1" max="50" aria-label="Cantidad">
                                <button class="btn btn-outline-secondary btn-sm increase-qty" aria-label="Aumentar">+</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        fragment.appendChild(productElement);
    });

    productContainer.innerHTML = '';
    productContainer.appendChild(fragment);

    // Hydrate card state from cart now that elements are in the DOM
    products.forEach(product => updateProductCardState(product.id));

    // Initialize animations
    productAnimations.init();
};

// Delegate add-to-cart clicks to the container (avoids inline handlers)
function attachAddToCartHandler() {
    const container = document.getElementById('product-container');
    if (!container || container.dataset.cartHandler === '1') return;
    container.dataset.cartHandler = '1';
    container.addEventListener('click', (e) => {
        const btn = e.target.closest('.add-to-cart-btn');
        if (!btn) return;
        const id = btn.getAttribute('data-product-id');
        if (id && typeof window.addToCart === 'function') {
            window.addToCart(id);
            updateProductCardState(id);
        }
    });
}

// Quantity controls (delegated)
function attachQuantityHandlers() {
    const container = document.getElementById('product-container');
    if (!container || container.dataset.qtyHandler === '1') return;
    container.dataset.qtyHandler = '1';

    container.addEventListener('click', (e) => {
        const inc = e.target.closest('.increase-qty');
        const dec = e.target.closest('.decrease-qty');
        if (!inc && !dec) return;
        const wrap = e.target.closest('.cart-controls');
        if (!wrap) return;
        const id = wrap.getAttribute('data-product-id');
        const input = wrap.querySelector('.quantity-input');
        let current = parseInt(input.value, 10) || 0;
        current = current + (inc ? 1 : -1);
        current = Math.max(0, Math.min(50, current));
        updateCartQuantity(id, current);
    });

    container.addEventListener('change', (e) => {
        const input = e.target.closest('.quantity-input');
        if (!input) return;
        const wrap = input.closest('.cart-controls');
        const id = wrap?.getAttribute('data-product-id');
        if (!id) return;
        let newQty = parseInt(input.value, 10) || 0;
        newQty = Math.max(0, Math.min(50, newQty));
        updateCartQuantity(id, newQty);
    });
}

// Simple cart functionality
window.addToCart = (productId) => {
    const product = window.appState.products.find(p => p.id === productId);
    if (!product) return;

    let cart = readCart();
    const existingItem = cart.find(item => item.id === productId);

    if (existingItem) {
        existingItem.quantity = Math.min(existingItem.quantity + 1, 50);
    } else {
        cart.push({ ...product, quantity: 1 });
    }
    writeCart(cart);
    // Optional UX: keep alert to confirm action
    try { alert(`${product.name} agregado al carrito`); } catch {}
};

// Main application state
window.appState = {
    products: [],
    cart: [],
    init: async () => {
        console.log('Initializing enhanced app...');

        // Ensure DOMPurify is loaded
        if (typeof DOMPurify === 'undefined') {
            try {
                await new Promise((resolve, reject) => {
                    const script = document.createElement('script');
                    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/dompurify/2.3.8/purify.min.js';
                    script.integrity = 'sha384-AsiVBlzbaNOq8OOKcXm2ZVjjKJwiQ9UmzLwfetDjC74OMQdkb6vBHH5QRJH3x1SE';
                    script.crossOrigin = 'anonymous';
                    try { if (window && window.__CSP_NONCE__) script.setAttribute('nonce', window.__CSP_NONCE__); } catch {}
                    script.onload = resolve;
                    script.onerror = reject;
                    document.head.appendChild(script);
                });
            } catch (error) {
                console.error('Failed to load DOMPurify:', error);
                return;
            }
        }

        // Load components first
        await coreLoader.loadComponents();

        // Then load products
        const products = await coreLoader.loadProducts();
        window.appState.products = products;

        // Migrate existing cart item IDs if product hashing changed
        try {
            const cart = readCart();
            if (cart.length && products.length) {
                const byName = new Map(products.map(p => [enhancedUtils.normalize(p.name), p]));
                let changed = false;
                cart.forEach(item => {
                    // If ID not found in current products, try fallback by normalized name
                    const stillExists = products.some(p => p.id === item.id);
                    if (!stillExists) {
                        const match = byName.get(enhancedUtils.normalize(item.name));
                        if (match) {
                            item.id = match.id;
                            changed = true;
                        }
                    }
                });
                if (changed) writeCart(cart);
            }
        } catch {}

        // Initialize enhanced features
        productAnimations.init();
        enhancedSearch.init();

        // Ensure navbar badge reflects persisted cart
        try { writeCart(readCart()); } catch {}

        // Render products
        renderProducts(products);
        if (typeof window !== 'undefined') window.__APP_READY__ = true;

        // Attach one-time delegated handler for add-to-cart and quantity controls
        attachAddToCartHandler();
        attachQuantityHandlers();

        // Initialize cart from storage for UI
        window.appState.cart = readCart();
        window.appState.cart.forEach(item => updateProductCardState(item.id));

        console.log('Enhanced app initialized successfully');
    }
};

// Initialize when DOM is ready
const initEnhancedApp = () => {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', window.appState.init);
    } else {
        window.appState.init();
    }
};

// Auto-initialize
initEnhancedApp();
