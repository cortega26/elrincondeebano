/**
 * Enhanced JavaScript for El Rincón de Ébano
 * Modern UX/UI improvements and animations + Core Loading Functionality
 */

'use strict';

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

    // Generic component loader
    loadComponent: async (container, filename) => {
        if (!container) {
            console.warn(`Container not found for component: ${filename}`);
            return;
        }

        try {
            const response = await fetch(filename);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const html = await response.text();
            container.innerHTML = html;
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
            const response = await fetch('/_products/product_data.json');
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
                <img src="${product.image_path}" alt="${product.name}" class="card-img-top">
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
                        <button class="btn btn-primary w-100 mt-2" onclick="addToCart('${product.id}')">
                            Agregar al Carrito
                        </button>
                    </div>
                </div>
            </div>
        `;

        fragment.appendChild(productElement);
    });

    productContainer.innerHTML = '';
    productContainer.appendChild(fragment);

    // Initialize animations
    productAnimations.init();
};

// Simple cart functionality
window.addToCart = (productId) => {
    const product = window.appState.products.find(p => p.id === productId);
    if (!product) return;

    let cart = JSON.parse(localStorage.getItem('cart')) || [];
    const existingItem = cart.find(item => item.id === productId);

    if (existingItem) {
        existingItem.quantity += 1;
    } else {
        cart.push({ ...product, quantity: 1 });
    }

    localStorage.setItem('cart', JSON.stringify(cart));
    alert(`${product.name} agregado al carrito`);
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

        // Initialize enhanced features
        productAnimations.init();
        enhancedSearch.init();

        // Render products
        renderProducts(products);

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
