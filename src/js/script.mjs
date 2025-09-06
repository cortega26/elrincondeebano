import { cfimg, CFIMG_THUMB } from './utils/cfimg.mjs';

// Service Worker Configuration and Initialization
const SERVICE_WORKER_CONFIG = {
    path: '/service-worker.js',
    scope: '/',
    updateCheckInterval: 5 * 60 * 1000, // 5 minutes
};

// Enhanced service worker registration with proper error handling and lifecycle management
function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) {
        console.warn('Service workers are not supported in this browser');
        return;
    }

    window.addEventListener('load', async () => {
        try {
            initializeServiceWorker();
        } catch (error) {
            console.error('Service Worker initialization failed:', error);
            showServiceWorkerError('Failed to initialize service worker. Some features may not work offline.');
        }
    });
}

// Initialize the service worker and set up event handlers
async function initializeServiceWorker() {
    try {
        const registration = await navigator.serviceWorker.register(
            SERVICE_WORKER_CONFIG.path,
            { scope: SERVICE_WORKER_CONFIG.scope }
        );

        console.log('ServiceWorker registered successfully:', registration.scope);

        // Set up update handling
        setupUpdateHandling(registration);

        // Set up periodic update checks
        setupPeriodicUpdateCheck(registration);

        // Handle controller changes
        setupControllerChangeHandling();

        // Set up offline/online detection
        setupConnectivityHandling();

    } catch (error) {
        console.error('ServiceWorker registration failed:', error);
        throw error;
    }
}

// Set up handling for service worker updates
function setupUpdateHandling(registration) {
    registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                // Immediately activate the new service worker without a prompt
                newWorker.postMessage({ type: 'SKIP_WAITING' });
            }
        });
    });
}


// Set up periodic checks for service worker updates
function setupPeriodicUpdateCheck(registration) {
    // Initial check
    checkForUpdates(registration);

    // Set up periodic checks
    setInterval(() => {
        checkForUpdates(registration);
    }, SERVICE_WORKER_CONFIG.updateCheckInterval);
}

// Check for service worker updates
async function checkForUpdates(registration) {
    try {
        await registration.update();

        // Check if product data needs updating
        const response = await fetch('/data/product_data.json', { cache: 'no-store', headers: { 'Accept': 'application/json' } });

        if (response.ok) {
            const data = await response.json();
            const currentVersion = data.version;
            const storedVersion = localStorage.getItem('productDataVersion');

            if (currentVersion !== storedVersion) {
                registration.active?.postMessage({
                    type: 'INVALIDATE_PRODUCT_CACHE'
                });

                localStorage.setItem('productDataVersion', currentVersion);
                showUpdateNotification(null, 'New product data available');
            }
        }
    } catch (error) {
        console.warn('Update check failed:', error);
    }
}

// Set up handling for service worker controller changes
function setupControllerChangeHandling() {
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshing) {
            refreshing = true;
            window.location.reload();
        }
    });
}

// Set up handling for online/offline connectivity
function setupConnectivityHandling() {
    const offlineIndicator = document.getElementById('offline-indicator');
    if (!offlineIndicator) {
        return;
    }
    const updateOnlineStatus = () => {
        const hidden = navigator.onLine;
        offlineIndicator.classList.toggle('is-hidden', hidden);
        offlineIndicator.style.display = hidden ? 'none' : 'block';

        if (!hidden) {
            showConnectivityNotification('You are currently offline. Some features may be limited.');
        }
    };

    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);

    if (!navigator.onLine) {
        updateOnlineStatus();
    }
}

// Show update notification to user
function showUpdateNotification(serviceWorker, message = 'Una versión está disponible') {
    const notification = createNotificationElement(
        message,
        'Actualizar ahora',
        'Después',
        () => {
            if (serviceWorker) {
                serviceWorker.postMessage({ type: 'SKIP_WAITING' });
            } else {
                window.location.reload();
            }
        }
    );

    showNotification(notification);
}

// Show error notification to user
function showServiceWorkerError(message) {
    const notification = createNotificationElement(
        message,
        'Reload',
        'Dismiss',
        () => window.location.reload()
    );

    showNotification(notification);
}

// Show connectivity notification to user
function showConnectivityNotification(message) {
    const notification = createNotificationElement(
        message,
        'Retry',
        'Dismiss',
        () => window.location.reload()
    );

    showNotification(notification);
}

// Create notification element
function createNotificationElement(message, primaryButtonText, secondaryButtonText, primaryAction) {
    const notification = document.createElement('div');
    notification.className = 'notification-toast';
    notification.setAttribute('role', 'alert');
    notification.setAttribute('aria-live', 'polite');

    notification.innerHTML = `
        <div class="notification-content">
            <p>${message}</p>
            <div class="notification-actions">
                <button class="primary-action">${primaryButtonText}</button>
                <button class="secondary-action">${secondaryButtonText}</button>
            </div>
        </div>
    `;

    // Set up event listeners
    notification.querySelector('.primary-action').addEventListener('click', () => {
        primaryAction();
        notification.remove();
    });

    notification.querySelector('.secondary-action').addEventListener('click', () => {
        notification.remove();
    });

    return notification;
}

// Show notification to user
function showNotification(notificationElement) {
    // Remove any existing notifications
    const existingNotification = document.querySelector('.notification-toast');
    if (existingNotification) {
        existingNotification.remove();
    }

    // Add new notification
    document.body.appendChild(notificationElement);

    // Auto-dismiss after 5 minutes
    setTimeout(() => {
        if (document.body.contains(notificationElement)) {
            notificationElement.remove();
        }
    }, 5 * 60 * 1000);
}

// Initialize the service worker when running in a browser environment
if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    registerServiceWorker();
}


// Utility functions
const memoize = (fn, cacheSize = 100) => {
    const cache = new Map();
    return (...args) => {
        const key = JSON.stringify(args);
        if (cache.has(key)) return cache.get(key);
        const result = fn(...args);
        if (cache.size >= cacheSize) {
            const oldestKey = cache.keys().next().value;
            cache.delete(oldestKey);
        }
        cache.set(key, result);
        return result;
    };
};

const debounce = (func, delay) => {
    let timeoutId;
    return (...args) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => func(...args), delay);
    };
};

// Normalize strings for robust comparisons (remove accents, spaces, punctuation, lowercased)
const normalizeString = (str) => {
    if (!str) return '';
    try {
        return String(str)
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-zA-Z0-9]/g, '')
            .toLowerCase();
    } catch {
        return String(str).toLowerCase();
    }
};



// Add this utility function for generating stable product IDs
const generateStableId = (product) => {
    // Create a stable ID using product properties that shouldn't change
    // Using name and category as they should be unique together
    const baseString = `${product.name}-${product.category}`.toLowerCase();

    // Create a simple hash of the string
    let hash = 0;
    for (let i = 0; i < baseString.length; i++) {
        const char = baseString.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
    }

    // Return a more readable ID format
    return `pid-${Math.abs(hash)}`;
};

const sanitizeHTML = (unsafe) => {
    const element = document.createElement('div');
    element.textContent = unsafe;
    return element.innerHTML;
};

// Modify the fetchProducts function
const fetchProducts = async () => {
    try {
        const version = localStorage.getItem('productDataVersion');
        const url = version ? `/data/product_data.json?v=${encodeURIComponent(version)}` : '/data/product_data.json';
        const response = await fetch(url, { cache: 'no-store', headers: { 'Accept': 'application/json' } });
        if (!response.ok) {
            throw new Error(`HTTP error. Status: ${response.status}`);
        }
        const data = await response.json();
        return data.products.map(product => ({
            ...product,
            id: generateStableId(product),
            name: sanitizeHTML(product.name),
            description: sanitizeHTML(product.description),
            category: sanitizeHTML(product.category),
            categoryKey: normalizeString(product.category)
        }));
    } catch (error) {
        console.error('Error al obtener productos:', error);
        showErrorMessage(`Error al cargar los productos. Por favor, verifique su conexión a internet e inténtelo de nuevo. (Error: ${error.message})`);
        throw error;
    }
};

const createSafeElement = (tag, attributes = {}, children = []) => {
    const element = document.createElement(tag);
    Object.entries(attributes).forEach(([key, value]) => {
        if (key === 'text') {
            element.textContent = value;
        } else {
            element.setAttribute(key, value);
        }
    });
    children.forEach(child => {
        if (typeof child === 'string') {
            element.appendChild(document.createTextNode(child));
        } else {
            element.appendChild(child);
        }
    });
    return element;
};

const showErrorMessage = (message) => {
    const errorMessage = createSafeElement('div', { class: 'error-message', role: 'alert' }, [
        createSafeElement('p', {}, [message]),
        createSafeElement('button', { class: 'retry-button' }, ['Intentar nuevamente'])
    ]);
    const productContainer = document.getElementById('product-container');
    if (productContainer) {
        productContainer.innerHTML = '';
        productContainer.appendChild(errorMessage);
        errorMessage.querySelector('.retry-button').addEventListener('click', initApp);
    } else {
        console.error('Contenedor de productos no encontrado');
    }
};

// Basic cart helpers (exposed for tests)
let cart = [];
try {
    cart = JSON.parse(globalThis.localStorage?.getItem('cart')) || [];
} catch {
    cart = [];
}

const getCartItemQuantity = (productId) => {
    const item = cart.find(item => item.id === productId);
    return item ? item.quantity : 0;
};

const updateCartIcon = () => {
    const cartCount = document.getElementById('cart-count');
    const totalItems = cart.reduce((total, item) => total + item.quantity, 0);
    if (cartCount) {
        cartCount.textContent = totalItems;
        cartCount.setAttribute('aria-label', `${totalItems} items in cart`);
    }
};

const saveCart = () => {
    try {
        globalThis.localStorage?.setItem('cart', JSON.stringify(cart));
    } catch (error) {
        console.error('Error al guardar el carrito:', error);
        showErrorMessage('Error al guardar el carrito. Tus cambios podrían no persistir.');
    }
};

const toggleActionArea = (btn, quantityControl, showQuantity) => {
    if (!btn || !quantityControl) return;
    if (showQuantity) {
        btn.style.display = 'none';
        quantityControl.style.display = 'flex';
    } else {
        quantityControl.style.display = 'none';
        btn.style.display = 'flex';
    }
};

const renderCart = () => {
    const cartItems = document.getElementById('cart-items');
    const cartTotal = document.getElementById('cart-total');
    if (!cartItems || !cartTotal) return;
    cartItems.innerHTML = '';
    let total = 0;
    cart.forEach(item => {
        const discounted = item.price - (item.discount || 0);
        const itemEl = createSafeElement('div', { class: 'cart-item', 'data-id': item.id });
        itemEl.appendChild(createSafeElement('span', { class: 'item-quantity' }, [item.quantity.toString()]));
        cartItems.appendChild(itemEl);
        total += discounted * item.quantity;
    });
    cartTotal.textContent = `$${total.toLocaleString('es-CL')}`;
};

const addToCart = (product, quantity) => {
    try {
        const existingItem = cart.find(item => item.id === product.id);
        if (existingItem) {
            existingItem.quantity = Math.min(existingItem.quantity + quantity, 50);
        } else {
            cart.push({
                id: product.id,
                name: product.name,
                description: product.description,
                price: product.price,
                discount: product.discount,
                image_path: product.image_path,
                quantity: Math.min(quantity, 50),
                category: product.category,
                stock: product.stock
            });
        }
        saveCart();
        updateCartIcon();
        renderCart();
        const quantityInput = document.querySelector(`[data-id="${product.id}"].quantity-input`);
        if (quantityInput) {
            quantityInput.value = Math.max(getCartItemQuantity(product.id), 1);
        }
    } catch (error) {
        console.error('Error al agregar al carrito:', error);
        showErrorMessage('Error al agregar el artículo al carrito. Por favor, intenta nuevamente.');
    }
};

const removeFromCart = (productId) => {
    try {
        cart = cart.filter(item => item.id !== productId);
        saveCart();
        updateCartIcon();
        renderCart();
        const actionArea = document.querySelector(`.action-area[data-pid="${productId}"]`);
        if (actionArea) {
            const btn = actionArea.querySelector('.add-to-cart-btn');
            const qc = actionArea.querySelector('.quantity-control');
            toggleActionArea(btn, qc, false);
        }
    } catch (error) {
        console.error('Error al eliminar del carrito:', error);
        showErrorMessage('Error al eliminar el artículo del carrito. Por favor, intenta nuevamente.');
    }
};

const updateQuantity = (product, change) => {
    try {
        const item = cart.find(item => item.id === product.id);
        const newQuantity = item ? item.quantity + change : 1;
        const actionArea = document.querySelector(`.action-area[data-pid="${product.id}"]`);
        const btn = actionArea?.querySelector('.add-to-cart-btn');
        const qc = actionArea?.querySelector('.quantity-control');

        if (newQuantity <= 0) {
            removeFromCart(product.id);
            toggleActionArea(btn, qc, false);
        } else if (newQuantity <= 50) {
            if (item) {
                item.quantity = newQuantity;
            } else {
                addToCart(product, 1);
                toggleActionArea(btn, qc, true);
            }
            saveCart();
            updateCartIcon();
            renderCart();

            const quantityInput = document.querySelector(`[data-id="${product.id}"].quantity-input`);
            if (quantityInput) {
                quantityInput.value = newQuantity;
                quantityInput.classList.add('quantity-changed');
                setTimeout(() => quantityInput.classList.remove('quantity-changed'), 300);
            }
        }
    } catch (error) {
        console.error('Error al actualizar cantidad:', error);
        showErrorMessage('Error al actualizar la cantidad. Por favor, intenta nuevamente.');
    }
};

const emptyCart = () => {
    try {
        cart = [];
        saveCart();
        updateCartIcon();
        renderCart();
        if (typeof updateProductDisplay === 'function') {
            updateProductDisplay();
        }
    } catch (error) {
        console.error('Error al vaciar el carrito:', error);
        showErrorMessage('Error al vaciar el carrito. Por favor, inténtelo de nuevo.');
    }
};

// Global error handling: be conservative during initial render
if (typeof window !== 'undefined') {
    window.__APP_READY__ = false;

    window.addEventListener('error', (event) => {
        const target = event.target || event.srcElement;
        const isResourceError = !!(target && (
            target.tagName === 'IMG' ||
            target.tagName === 'SCRIPT' ||
            target.tagName === 'LINK'
        ));
        const hasRuntimeError = !!event.error;

        // Ignore resource errors and non-runtime errors
        if (isResourceError || !hasRuntimeError) {
            console.warn('Ignored non-fatal error:', {
                tag: target && target.tagName,
                src: target && (target.src || target.href || target.currentSrc)
            });
            return;
        }

        // Only show banner after the app is ready; otherwise just log
        if (!window.__APP_READY__) {
            console.error('Runtime error before app ready:', event.error);
            return;
        }
        console.error('Unhandled JS error:', event.error);
        showErrorMessage('Ocurrió un error inesperado. Por favor, recarga la página.');
    });

    // Avoid noisy CSP warnings breaking UX
    window.addEventListener('securitypolicyviolation', (e) => {
        console.warn('CSP violation (logged only):', {
            blockedURI: e.blockedURI,
            violatedDirective: e.violatedDirective,
            sourceFile: e.sourceFile,
        });
    });
}

// Main function to initialize the application
const initApp = async () => {
    console.log('Initializing app...');

    // Ensure DOMPurify is loaded before proceeding (fall back if blocked by client)
    if (typeof DOMPurify === 'undefined') {
        try {
            await new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = 'https://cdnjs.cloudflare.com/ajax/libs/dompurify/2.3.8/purify.min.js';
                script.integrity = 'sha384-AsiVBlzbaNOq8OOKcXm2ZVjjKJwiQ9UmzLwfetDjC74OMQdkb6vBHH5QRJH3x1SE';
                script.crossOrigin = 'anonymous';
                script.onload = resolve;
                script.onerror = reject;
                document.head.appendChild(script);
            });
        } catch (error) {
            console.warn('DOMPurify CDN blocked; using noop sanitizer');
            window.DOMPurify = { sanitize: (html) => html };
        }
    }

    const navbarContainer = document.getElementById('navbar-container');
    const footerContainer = document.getElementById('footer-container');
    const productContainer = document.getElementById('product-container');
    const sortOptions = document.getElementById('sort-options');
    const filterKeyword = document.getElementById('filter-keyword');

    // Ensure discount-only toggle exists in the filter UI
    const ensureDiscountToggle = () => {
        let toggle = document.getElementById('filter-discount');
        if (toggle) return toggle;

        const filterSection = document.querySelector('section[aria-label*="filtrado"], section[aria-label*="Opciones de filtrado"]');
        const filterSectionRow = filterSection ? filterSection.querySelector('.row') : null;
        if (!filterSectionRow) return null;

        const col = createSafeElement('div', { class: 'col-12 mt-2' });
        const formCheck = createSafeElement('div', { class: 'form-check form-switch' });
        const input = createSafeElement('input', {
            class: 'form-check-input',
            type: 'checkbox',
            id: 'filter-discount',
            'aria-label': 'Mostrar solo productos con descuento'
        });
        const label = createSafeElement('label', { class: 'form-check-label', for: 'filter-discount' }, ['Solo productos con descuento']);
        formCheck.appendChild(input);
        formCheck.appendChild(label);
        col.appendChild(formCheck);
        filterSectionRow.appendChild(col);
        return input;
    };

    let products = [];
    let cart = JSON.parse(localStorage.getItem('cart')) || [];

    const updateOnlineStatus = () => {
        const offlineIndicator = document.getElementById('offline-indicator');
        if (offlineIndicator) {
            const hidden = navigator.onLine;
            offlineIndicator.classList.toggle('is-hidden', hidden);
            offlineIndicator.style.display = hidden ? 'none' : 'block';
        }
        if (!navigator.onLine) {
            console.log('App is offline. Using cached data if available.');
        }
    };

    const loadComponent = async (container, filename) => {

        if (!container) {
            console.warn(`Contenedor no encontrado para el componente: ${filename}`);
            return;
        }

        try {
            const response = await fetch(filename);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const html = await response.text();

            const sanitizedHtml = DOMPurify.sanitize(html, {
                USE_PROFILES: { html: true },
                ALLOWED_TAGS: ['div', 'span', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'a', 'img', 'br', 'strong', 'em', 'button', 'nav', 'footer', 'header', 'main', 'section'],
                ALLOWED_ATTR: ['href', 'src', 'alt', 'class', 'id', 'style', 'aria-label', 'role', 'type', 'data-bs-toggle', 'data-bs-target', 'aria-controls', 'aria-expanded']
            });

            container.innerHTML = '';
            const parser = new DOMParser();
            const doc = parser.parseFromString(sanitizedHtml, 'text/html');

            Array.from(doc.body.children).forEach(child => {
                container.appendChild(child.cloneNode(true));
            });
        } catch (error) {
            console.error("Error al cargar componente:", { component: filename, message: error.message });
            throw error;
        }
    };

    function initFooter() {
        const yearSpan = document.getElementById('current-year');
        if (yearSpan) {
            yearSpan.textContent = new Date().getFullYear();
        }
    }

    const loadComponents = async () => {
        try {
            await Promise.all([
                loadComponent(navbarContainer, '/pages/navbar.html'),
                loadComponent(footerContainer, '/pages/footer.html')
            ]);
            console.log('Components loaded successfully');
            initFooter();
        } catch (error) {
            console.error('Error al cargar componentes:', error);
            showErrorMessage('Error al cargar los componentes de la página. Por favor, actualice la página o verifique su conexión a internet.');
        }
    };

    const renderPriceHtml = (price, discount, currencyCode = 'CLP') => {
        const formatter = new Intl.NumberFormat('es-CL', {
            style: 'currency',
            currency: currencyCode,
            minimumFractionDigits: 0
        });

        const formattedPrice = formatter.format(price);

        if (discount) {
            const discountedPrice = price - discount;
            const formattedDiscountedPrice = formatter.format(discountedPrice);

            return createSafeElement('div', { class: 'precio-container' }, [
                createSafeElement(
                    'span',
                    { class: 'precio-descuento', 'aria-label': 'Precio con descuento' },
                    [formattedDiscountedPrice]
                ),
                createSafeElement(
                    'span',
                    { class: 'precio-original', 'aria-label': 'Precio original' },
                    [
                        createSafeElement(
                            'span',
                            { class: 'tachado' },
                            [formattedPrice]
                        )
                    ]
                )
            ]);
        }

        return createSafeElement('div', { class: 'precio-container' }, [
            createSafeElement(
                'span',
                { class: 'precio', 'aria-label': 'Precio' },
                [formattedPrice]
            )
        ]);
    };


    const renderQuantityControl = (product) => {
        const quantityControl = createSafeElement('div', { class: 'quantity-control' });
        const minusBtn = createSafeElement('button', { class: 'quantity-btn', 'aria-label': 'Decrease quantity' }, ['-']);
        const plusBtn = createSafeElement('button', { class: 'quantity-btn', 'aria-label': 'Increase quantity' }, ['+']);
        const input = createSafeElement('input', {
            type: 'number',
            class: 'quantity-input',
            value: Math.max(getCartItemQuantity(product.id), 1),
            min: '1',
            max: '50',
            'aria-label': 'Quantity',
            'data-id': product.id
        });

        minusBtn.addEventListener('click', () => updateQuantity(product, -1));
        plusBtn.addEventListener('click', () => updateQuantity(product, 1));
        input.addEventListener('change', (e) => {
            const newQuantity = parseInt(e.target.value, 10);
            const currentQuantity = getCartItemQuantity(product.id);
            updateQuantity(product, newQuantity - currentQuantity);
        });

        quantityControl.appendChild(minusBtn);
        quantityControl.appendChild(input);
        quantityControl.appendChild(plusBtn);

        return quantityControl;
    };

    const getCartItemQuantity = (productId) => {
        const item = cart.find(item => item.id === productId);
        return item ? item.quantity : 0;
    };

    const renderProducts = (productsToRender) => {
        const fragment = document.createDocumentFragment();

        productsToRender.forEach(product => {
            const { id, name, description, image_path, price, discount, stock } = product;

            const productElement = createSafeElement('div', {
                class: `producto col-12 col-sm-6 col-md-4 col-lg-3 mb-4 ${!stock ? 'agotado' : ''}`,
                'aria-label': `Product: ${name}`
            });

            const cardElement = createSafeElement('div', { class: 'card' });

            // Discount badge
            if (discount && Number(discount) > 0) {
                const pct = Math.round((Number(discount) / Number(price)) * 100);
                const badge = createSafeElement('span', { class: 'discount-badge badge bg-danger', 'aria-label': 'Producto en oferta' }, [`-${isFinite(pct) ? pct : 0}%`]);
                cardElement.appendChild(badge);
            }

            const imgPath = `/${image_path.replace(/^\//, '')}`;
            const imgElement = createSafeElement('img', {
                src: cfimg(imgPath, { ...CFIMG_THUMB, width: 400 }),
                srcset: [
                    `${cfimg(imgPath, { ...CFIMG_THUMB, width: 200 })} 200w`,
                    `${cfimg(imgPath, { ...CFIMG_THUMB, width: 400 })} 400w`,
                    `${cfimg(imgPath, { ...CFIMG_THUMB, width: 800 })} 800w`
                ].join(', '),
                sizes: '(max-width: 640px) 200px, 400px',
                alt: name,
                class: 'card-img-top product-thumb',
                loading: 'lazy',
                decoding: 'async',
                width: '400',
                height: '400'
            });
            cardElement.appendChild(imgElement);

            const cardBody = createSafeElement('div', { class: 'card-body' });
            cardBody.appendChild(createSafeElement('h3', { class: 'card-title' }, [name]));
            cardBody.appendChild(createSafeElement('p', { class: 'card-text' }, [description]));

            cardBody.appendChild(renderPriceHtml(price, discount));

            // Action area: pre-render both states and toggle visibility to avoid image repaint/flicker
            const actionArea = createSafeElement('div', { class: 'action-area', 'data-pid': id });

            // Add button
            const addToCartBtn = createSafeElement('button', {
                class: 'btn btn-primary add-to-cart-btn mt-2',
                'data-id': id,
                'aria-label': `Add ${name} to cart`
            }, ['Agregar al carrito']);
            // Quantity controls
            const quantityControl = renderQuantityControl(product);
            // Hide quantity control by default to prevent brief double render
            quantityControl.style.display = 'none';

            addToCartBtn.addEventListener('click', () => {
                addToCart(product, 1);
                toggleActionArea(addToCartBtn, quantityControl, true);
            });

            actionArea.appendChild(addToCartBtn);
            actionArea.appendChild(quantityControl);
            cardBody.appendChild(actionArea);

            // Set initial state based on cart
            const cartItem = cart.find(item => item.id === id);
            const cartItemQuantity = cartItem ? cartItem.quantity : 0;
            const quantityInput = quantityControl.querySelector('.quantity-input');
            if (cartItemQuantity > 0) {
                if (quantityInput) quantityInput.value = cartItemQuantity;
                addToCartBtn.style.display = 'none';
                quantityControl.style.display = 'flex';
            } else {
                addToCartBtn.style.display = 'flex';
                quantityControl.style.display = 'none';
            }

            cardElement.appendChild(cardBody);
            productElement.appendChild(cardElement);
            fragment.appendChild(productElement);
        });

        const productContainer = document.getElementById('product-container');
        productContainer.innerHTML = '';
        productContainer.appendChild(fragment);
        lazyLoadImages();
    };

    const lazyLoadImages = () => {
        const imageObserver = new IntersectionObserver((entries, observer) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    img.src = img.dataset.src;
                    if (img.dataset.srcset) img.srcset = img.dataset.srcset;
                    if (img.dataset.sizes) img.sizes = img.dataset.sizes;
                    img.classList.remove('lazyload');
                    observer.unobserve(img);
                }
            });
        }, { rootMargin: '100px' });

        document.querySelectorAll('img.lazyload').forEach(img => imageObserver.observe(img));
    };

    // MUCH MORE CONSERVATIVE fuzzy matching - only for obvious typos
    function simpleTypoFix(query, text) {
    if (!query || !text || query.length < 3) return false;
    
    const normalizeText = (str) => str.toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Remove accents only
        .trim();
    
    const normalizedQuery = normalizeText(query);
    const normalizedText = normalizeText(text);
    
    // First try exact match (same as original)
    if (normalizedText.includes(normalizedQuery)) {
        return true;
    }
    
    // ONLY try typo correction if query is 4+ characters
    // and the difference is just 1-2 characters
    if (normalizedQuery.length >= 4) {
        // Check if it's a simple 1-character typo
        // Like "choclate" vs "chocolate" or "galetas" vs "galletas"
        return isSimpleTypo(normalizedQuery, normalizedText);
    }
    
    return false;
    }

    // Very strict typo detection - only catches obvious single-character mistakes
    function isSimpleTypo(query, text) {
    const words = text.split(/\s+/);
    
    return words.some(word => {
        if (Math.abs(word.length - query.length) > 1) return false;
        
        // Count character differences
        let differences = 0;
        const maxLen = Math.max(word.length, query.length);
        const minLen = Math.min(word.length, query.length);
        
        // Too short to safely compare
        if (minLen < 4) return false;
        
        // Check for single character insertion/deletion
        if (word.length === query.length) {
        // Same length - check for substitution
        for (let i = 0; i < word.length; i++) {
            if (word[i] !== query[i]) differences++;
            if (differences > 1) return false; // More than 1 difference
        }
        return differences === 1;
        } else {
        // Different length - check for insertion/deletion
        return isOneCharacterDifference(query, word);
        }
    });
    }

    // Check if two words differ by exactly one character (insertion/deletion)
    function isOneCharacterDifference(str1, str2) {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length - shorter.length !== 1) return false;
    
    let shifts = 0;
    let i = 0, j = 0;
    
    while (i < shorter.length && j < longer.length) {
        if (shorter[i] === longer[j]) {
        i++;
        j++;
        } else {
        shifts++;
        if (shifts > 1) return false; // More than one shift needed
        j++; // Skip the extra character in longer string
        }
    }
    
    return true;
    }

    // REPLACE your filterProducts function with this CONSERVATIVE version:
    const filterProducts = (products, keyword, sortCriterion, discountOnly = false) => {
    const trimmedKeyword = keyword.trim();
    
    return products
        .filter(product => {
        if (!product.stock) return false;
        if (discountOnly && !(product.discount && Number(product.discount) > 0)) return false;
        
        // If no keyword, show all (same as original behavior)
        if (!trimmedKeyword) return true;
        
        // Try EXACT matching first (exactly like original)
        const exactMatch = product.name.toLowerCase().includes(trimmedKeyword.toLowerCase()) ||
                            product.description.toLowerCase().includes(trimmedKeyword.toLowerCase());
        
        if (exactMatch) return true;
        
        // ONLY try typo fix for longer queries and only for name field
        if (trimmedKeyword.length >= 4) {
            return simpleTypoFix(trimmedKeyword, product.name);
        }
        
        return false;
        })
        .sort((a, b) => sortProducts(a, b, sortCriterion));
    };

    const sortProducts = (a, b, criterion) => {
        if (!criterion || criterion === 'original') {
            return a.originalIndex - b.originalIndex;
        }
        const [property, order] = criterion.split('-');
        const valueA = property === 'price' ? a.price - (a.discount || 0) : a.name.toLowerCase();
        const valueB = property === 'price' ? b.price - (b.discount || 0) : b.name.toLowerCase();
        return order === 'asc' ?
            (valueA < valueB ? -1 : valueA > valueB ? 1 : 0) :
            (valueB < valueA ? -1 : valueB > valueA ? 1 : 0);
    };

    const memoizedFilterProducts = memoize(filterProducts);

    const updateProductDisplay = () => {
        try {
            const criterion = sortOptions.value || 'original';
            const keyword = filterKeyword.value.trim();
            const discountOnly = document.getElementById('filter-discount')?.checked || false;
            const filteredAndSortedProducts = memoizedFilterProducts(products, keyword, criterion, discountOnly);
            renderProducts(filteredAndSortedProducts);
        } catch (error) {
            console.error('Error al actualizar visualización de productos:', error);
            showErrorMessage('Error al actualizar la visualización de productos. Por favor, intenta más tarde.');
        }
    };

    const debouncedUpdateProductDisplay = debounce(updateProductDisplay, 300);

    const updateCartIcon = () => {
        const cartCount = document.getElementById('cart-count');
        const totalItems = cart.reduce((total, item) => total + item.quantity, 0);
        cartCount.textContent = totalItems;
        cartCount.setAttribute('aria-label', `${totalItems} items in cart`);
    };

    const addToCart = (product, quantity) => {
        try {
            const existingItem = cart.find(item => item.id === product.id);
            if (existingItem) {
                existingItem.quantity = Math.min(existingItem.quantity + quantity, 50);
            } else {
                // Store complete product information
                cart.push({
                    id: product.id,
                    name: product.name,
                    description: product.description,
                    price: product.price,
                    discount: product.discount,
                    image_path: product.image_path,
                    quantity: Math.min(quantity, 50),
                    category: product.category,
                    stock: product.stock
                });
            }
            saveCart();
            updateCartIcon();
            renderCart();

            const quantityInput = document.querySelector(`[data-id="${product.id}"].quantity-input`);
            if (quantityInput) {
                quantityInput.value = Math.max(getCartItemQuantity(product.id), 1);
            }
        } catch (error) {
            console.error('Error al agregar al carrito:', error);
            showErrorMessage('Error al agregar el artículo al carrito. Por favor, intenta nuevamente.');
        }
    };

    const removeFromCart = (productId) => {
        try {
            cart = cart.filter(item => item.id !== productId);
            saveCart();
            updateCartIcon();
            renderCart();
            // Toggle card back to add state without re-rendering
            const actionArea = document.querySelector(`.action-area[data-pid="${productId}"]`);
            if (actionArea) {
                const btn = actionArea.querySelector('.add-to-cart-btn');
                const qc = actionArea.querySelector('.quantity-control');
                toggleActionArea(btn, qc, false);
            }
        }
        catch (error) {
            console.error('Error al eliminar del carrito:', error);
            showErrorMessage('Error al eliminar el artículo del carrito. Por favor, intenta nuevamente.');
        }
    };

    const updateQuantity = (product, change) => {
        try {
            const item = cart.find(item => item.id === product.id);
            const newQuantity = item ? item.quantity + change : 1;

            const actionArea = document.querySelector(`.action-area[data-pid="${product.id}"]`);
            const btn = actionArea?.querySelector('.add-to-cart-btn');
            const qc = actionArea?.querySelector('.quantity-control');

            if (newQuantity <= 0) {
                removeFromCart(product.id);
                toggleActionArea(btn, qc, false);
            } else if (newQuantity <= 50) {
                if (item) {
                    item.quantity = newQuantity;
                } else {
                    addToCart(product, 1);
                    toggleActionArea(btn, qc, true);
                }
                saveCart();
                updateCartIcon();
                renderCart();

                const quantityInput = document.querySelector(`[data-id="${product.id}"].quantity-input`);
                if (quantityInput) {
                    quantityInput.value = newQuantity;
                    quantityInput.classList.add('quantity-changed');
                    setTimeout(() => quantityInput.classList.remove('quantity-changed'), 300);
                }
            }
        } catch (error) {
            console.error('Error al actualizar cantidad:', error);
            showErrorMessage('Error al actualizar la cantidad. Por favor, intenta nuevamente.');
        }
    };

    const emptyCart = () => {
        try {
            cart = [];
            saveCart();
            updateCartIcon();
            renderCart();
            updateProductDisplay();
        } catch (error) {
            console.error('Error al vaciar el carrito:', error);
            showErrorMessage('Error al vaciar el carrito. Por favor, inténtelo de nuevo.');
        }
    };

    // Toggle action area in a specific card without re-rendering the grid
    const toggleActionArea = (btn, quantityControl, showQuantity) => {
        if (!btn || !quantityControl) return;
        if (showQuantity) {
            btn.style.display = 'none';
            quantityControl.style.display = 'flex';
        } else {
            quantityControl.style.display = 'none';
            btn.style.display = 'flex';
        }
    };

    const saveCart = () => {
        try {
            localStorage.setItem('cart', JSON.stringify(cart));
        } catch (error) {
            console.error('Error al guardar el carrito:', error);
            showErrorMessage('Error al guardar el carrito. Tus cambios podrían no persistir.');
        }
    };

    // Find the renderCart function (around line 485) and modify it like this:

    const renderCart = () => {
        const cartItems = document.getElementById('cart-items');
        const cartTotal = document.getElementById('cart-total');
        cartItems.innerHTML = '';

        let total = 0;

        cart.forEach(item => {
            const discountedPrice = item.price - (item.discount || 0);

            // Contenedor principal: usar flex de Bootstrap (con fallback CSS para thumbnail)
            const itemElement = createSafeElement('div', {
                class: 'cart-item mb-3 d-flex align-items-start',
                'aria-label': `Cart item: ${item.name}`
            });

            // Contenedor de datos del producto (nombre, controles, precio, subtotal, botón)
            const contentContainer = createSafeElement('div', {
                class: 'cart-item-content flex-grow-1'
            });

            // Nombre
            contentContainer.appendChild(
                createSafeElement('div', { class: 'fw-bold mb-1' }, [item.name])
            );

            // Controles de cantidad
            const quantityContainer = createSafeElement('div', { class: 'mb-2' });
            const decreaseBtn = createSafeElement('button', {
                class: 'btn btn-sm btn-secondary decrease-quantity',
                'data-id': item.id,
                'aria-label': `Disminuir cantidad de ${item.name}`
            }, ['-']);
            const increaseBtn = createSafeElement('button', {
                class: 'btn btn-sm btn-secondary increase-quantity',
                'data-id': item.id,
                'aria-label': `Aumentar cantidad de ${item.name}`
            }, ['+']);
            const quantitySpan = createSafeElement('span', {
                class: 'mx-2 item-quantity',
                'aria-label': `Cantidad de ${item.name}`
            }, [item.quantity.toString()]);
            quantityContainer.appendChild(decreaseBtn);
            quantityContainer.appendChild(quantitySpan);
            quantityContainer.appendChild(increaseBtn);
            contentContainer.appendChild(quantityContainer);

            // Precio y subtotal
            contentContainer.appendChild(
                createSafeElement('div', { class: 'text-muted small' },
                    [`Precio: $${discountedPrice.toLocaleString('es-CL')}`]
                )
            );
            contentContainer.appendChild(
                createSafeElement('div', { class: 'fw-bold' },
                    [`Subtotal: $${(discountedPrice * item.quantity).toLocaleString('es-CL')}`]
                )
            );

            // Botón "Eliminar"
            const removeBtn = createSafeElement('button', {
                class: 'btn btn-sm btn-danger remove-item mt-2',
                'data-id': item.id,
                'aria-label': `Eliminar ${item.name} del carrito`
            }, ['Eliminar']);
            contentContainer.appendChild(removeBtn);

            // Determinar ruta de la imagen (igual que en renderProducts)
            const isSubcategoryPage = window.location.pathname.includes('/pages/');
            let adjustedImagePath;
            if (isSubcategoryPage) {
                adjustedImagePath = `../${item.image_path.replace(/^\//, '')}`;
            } else {
                adjustedImagePath = item.image_path;
            }

            // Miniatura a la derecha (CSP-safe), contenido a la izquierda
            const thumbnailContainer = createSafeElement('div', {
                class: 'cart-item-thumb ms-3 flex-shrink-0'
            });
            // Preferir miniatura específica si está disponible
            const thumbSrc = item.thumbnail_path || adjustedImagePath;
            const thumbAttrs = {
                src: thumbSrc,
                alt: item.name,
                class: 'cart-item-thumb-img',
                loading: 'lazy',
                decoding: 'async',
                width: '100',
                height: '100'
            };
            if (Array.isArray(item.thumbnail_variants)) {
                const parts = item.thumbnail_variants
                    .filter(v => v && v.url && v.width)
                    .map(v => `${v.url} ${v.width}w`);
                if (parts.length) {
                    thumbAttrs.srcset = parts.join(', ');
                    thumbAttrs.sizes = '100px';
                }
            }
            const thumbnailImg = createSafeElement('img', thumbAttrs);
            thumbnailContainer.appendChild(thumbnailImg);

            // Añadir primero el contenido (izquierda) y luego la miniatura (derecha)
            itemElement.appendChild(contentContainer);
            itemElement.appendChild(thumbnailContainer);

            // Insertar en el DOM
            cartItems.appendChild(itemElement);

            // Debug (opt-in): inspect computed styles and rectangles
            if (window.__DEBUG_CART__) {
                try {
                    const cs = window.getComputedStyle(itemElement);
                    const csThumb = window.getComputedStyle(thumbnailContainer);
                    const csContent = window.getComputedStyle(contentContainer);
                    const rectThumb = thumbnailContainer.getBoundingClientRect();
                    const rectContent = contentContainer.getBoundingClientRect();
                    console.debug('[cart] item', {
                        name: item.name,
                        order: {
                            firstIsContent: itemElement.firstChild === contentContainer,
                            lastIsThumb: itemElement.lastChild === thumbnailContainer,
                        },
                        container: { display: cs.display, flexDirection: cs.flexDirection, flexWrap: cs.flexWrap },
                        thumb: { width: csThumb.width, height: csThumb.height, rect: { w: rectThumb.width, h: rectThumb.height } },
                        content: { rect: { w: rectContent.width, h: rectContent.height } },
                    });
                } catch (e) { /* ignore */ }
            }

            // Calcular total
            total += discountedPrice * item.quantity;
        });

        // Mostrar total
        cartTotal.textContent = `Total: $${total.toLocaleString('es-CL')}`;
        cartTotal.setAttribute('aria-label', `Total: $${total.toLocaleString('es-CL')}`);

        // Mostrar u ocultar la opción de pago con tarjeta de crédito según el total
        const creditOption = document.getElementById('payment-credit-container');
        if (creditOption) {
            if (total >= 30000) {
                creditOption.classList.remove('d-none');
            } else {
                creditOption.classList.add('d-none');
                const creditInput = creditOption.querySelector('input');
                if (creditInput) {
                    creditInput.checked = false;
                }
            }
        }
    };


    const submitCart = () => {
        const selectedPayment = document.querySelector('input[name="paymentMethod"]:checked');
        if (!selectedPayment) {
            alert('Por favor seleccione un método de pago');
            return;
        }

        let message = "Mi pedido:\n\n";
        cart.forEach(item => {
            const discountedPrice = item.price - (item.discount || 0);
            message += `${item.name}\n`;
            message += `Cantidad: ${item.quantity}\n`;
            message += `Precio unitario: $${discountedPrice.toLocaleString('es-CL')}\n`;
            message += `Subtotal: $${(discountedPrice * item.quantity).toLocaleString('es-CL')}\n\n`;
        });

        const total = cart.reduce((sum, item) => sum + (item.price - (item.discount || 0)) * item.quantity, 0);
        message += `Total: $${total.toLocaleString('es-CL')}\n`;
        message += `Método de pago: ${selectedPayment.value}`;

        const encodedMessage = encodeURIComponent(message);
        window.open(`https://wa.me/56951118901?text=${encodedMessage}`, '_blank');
    };

    try {
        await loadComponents();
        products = await fetchProducts();

        if (products.length === 0) {
            showErrorMessage('No hay productos disponibles. Por favor, intenta más tarde.');
            return;
        }

        const currentCategory = document.querySelector('main').dataset.category;
        if (currentCategory) {
            const normCurrent = normalizeString(currentCategory);
            products = products.filter(product => (product.categoryKey || normalizeString(product.category)) === normCurrent);
        }
        sortOptions.addEventListener('change', debouncedUpdateProductDisplay);
        filterKeyword.addEventListener('input', debouncedUpdateProductDisplay);

        // Set up discount-only toggle
        const discountToggle = ensureDiscountToggle();
        if (discountToggle) {
            discountToggle.addEventListener('change', debouncedUpdateProductDisplay);
        }

        // Initial product display
        updateProductDisplay();
        // Mark the app as ready after first successful render
        if (typeof window !== 'undefined') window.__APP_READY__ = true;

        // Offline support
        window.addEventListener('online', updateOnlineStatus);
        window.addEventListener('offline', updateOnlineStatus);
        updateOnlineStatus();

        // Shopping cart event listeners
        const cartIcon = document.getElementById('cart-icon');
        const emptyCartBtn = document.getElementById('empty-cart');
        const submitCartBtn = document.getElementById('submit-cart');

        cartIcon.addEventListener('click', () => {
            if (typeof window.bootstrap !== 'undefined' && window.bootstrap.Offcanvas) {
                const cartOffcanvas = new window.bootstrap.Offcanvas(document.getElementById('cartOffcanvas'));
                renderCart();
                cartOffcanvas.show();
            } else {
                console.error('Bootstrap Offcanvas no está disponible');
                renderCart();
                const cartOffcanvasElement = document.getElementById('cartOffcanvas');
                if (cartOffcanvasElement) {
                    cartOffcanvasElement.classList.add('show');
                }
            }
        });

        emptyCartBtn.addEventListener('click', emptyCart);
        submitCartBtn.addEventListener('click', submitCart);

        document.getElementById('cart-items').addEventListener('click', (e) => {
            const target = e.target;
            const productId = target.closest('[data-id]')?.dataset.id;

            if (!productId) return;

            if (target.classList.contains('decrease-quantity')) {
                updateQuantity({ id: productId }, -1);
            } else if (target.classList.contains('increase-quantity')) {
                updateQuantity({ id: productId }, 1);
            } else if (target.classList.contains('remove-item')) {
                removeFromCart(productId);
            }
        });

        updateCartIcon();

        // Performance monitoring
        if ('performance' in window) {
            window.addEventListener('load', () => {
                const paintTime = performance.getEntriesByType('paint');
                const navigationTime = performance.getEntriesByType('navigation')[0];
                console.log('First Contentful Paint:', paintTime[0].startTime);
                console.log('DOM Content Loaded:', navigationTime.domContentLoadedEventEnd);
                console.log('Load Time:', navigationTime.loadEventEnd);
            });
        }

    } catch (error) {
        console.error("Error al inicializar productos:", error);
        showErrorMessage('Error al cargar productos. Por favor, inténtelo más tarde.');
    }
};

// Run the application when the DOM is ready
if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', function () {
        // Register service worker first
        registerServiceWorker();

        // Then initialize the app
        initApp().catch(error => {
            console.error('Error al inicializar la aplicación:', error);
            showErrorMessage('Error al inicializar la aplicación. Por favor, actualice la página.');
        });
    });
}
function __getCart() {
    return cart;
}

function __resetCart() {
    cart = [];
}

export {
    generateStableId,
    fetchProducts,
    addToCart,
    removeFromCart,
    updateQuantity,
    updateCartIcon,
    showUpdateNotification,
    showServiceWorkerError,
    showConnectivityNotification,
    __getCart,
    __resetCart
};


