'use strict';

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
        const response = await fetch('/_products/product_data.json', {
            headers: {
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache'
            }
        });
        
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
    const updateOnlineStatus = () => {
        const offlineIndicator = document.getElementById('offline-indicator');
        if (offlineIndicator) {
            offlineIndicator.style.display = navigator.onLine ? 'none' : 'block';
        }
        
        if (!navigator.onLine) {
            showConnectivityNotification('You are currently offline. Some features may be limited.');
        }
    };

    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    updateOnlineStatus(); // Initial check
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

// Initialize the service worker
registerServiceWorker();


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
        const response = await fetch('/_products/product_data.json', {
            headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
            }
        });
        if (!response.ok) {
            throw new Error(`HTTP error. Status: ${response.status}`);
        }
        const data = await response.json();
        return data.products.map(product => ({
            ...product,
            id: generateStableId(product),
            name: sanitizeHTML(product.name),
            description: sanitizeHTML(product.description),
            category: sanitizeHTML(product.category)
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

// Global error handler
window.addEventListener('error', (event) => {
    console.error("Error global:", event.error);
    showErrorMessage('Ocurrió un error inesperado. Por favor, recarga la página.');
});

// Main function to initialize the application
const initApp = async () => {
    console.log('Initializing app...');

    // Ensure DOMPurify is loaded before proceeding
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
            showErrorMessage('Failed to load required dependencies. Please refresh the page.');
            return;
        }
    }

    const navbarContainer = document.getElementById('navbar-container');
    const footerContainer = document.getElementById('footer-container');
    const productContainer = document.getElementById('product-container');
    const sortOptions = document.getElementById('sort-options');
    const filterKeyword = document.getElementById('filter-keyword');

    let products = [];
    let cart = JSON.parse(localStorage.getItem('cart')) || [];

    const updateOnlineStatus = () => {
        const offlineIndicator = document.getElementById('offline-indicator');
        if (offlineIndicator) {
            offlineIndicator.style.display = navigator.onLine ? 'none' : 'block';
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

    const loadComponents = async () => {
        try {
            await Promise.all([
                loadComponent(navbarContainer, '/pages/navbar.html'),
                loadComponent(footerContainer, '/pages/footer.html')
            ]);
            console.log('Components loaded successfully');
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
            const formattedDiscount = formatter.format(discount);
            return createSafeElement('div', { class: 'precio-container' }, [
                createSafeElement('span', { class: 'precio-descuento', 'aria-label': 'Precio con descuento' }, [formattedDiscountedPrice]),
                createSafeElement('span', { class: 'ahorra', 'aria-label': 'Monto de ahorro' }, [`Ahorra ${formattedDiscount}`]),
                createSafeElement('span', { class: 'precio-original', 'aria-label': 'Precio original' }, [
                    'Regular: ',
                    createSafeElement('span', { class: 'tachado' }, [formattedPrice])
                ])
            ]);
        } else {
            return createSafeElement('span', { class: 'precio', 'aria-label': 'Precio' }, [formattedPrice]);
        }
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
        const isSubcategoryPage = window.location.pathname.includes('/pages/');
        
        productsToRender.forEach(product => {
            const { id, name, description, image_path, price, discount, stock } = product;
            
            const productElement = createSafeElement('div', {
                class: `producto col-12 col-sm-6 col-md-4 col-lg-3 mb-4 ${!stock ? 'agotado' : ''}`,
                'aria-label': `Product: ${name}`
            });
    
            const cardElement = createSafeElement('div', { class: 'card' });
            
            let adjustedImagePath;
            if (isSubcategoryPage) {
                adjustedImagePath = `../${image_path.replace(/^\//, '')}`;
            } else {
                adjustedImagePath = image_path;
            }
            
            const imgElement = createSafeElement('img', {
                'data-src': adjustedImagePath,
                alt: name,
                class: 'card-img-top lazyload'
            });
            cardElement.appendChild(imgElement);
    
            const cardBody = createSafeElement('div', { class: 'card-body' });
            cardBody.appendChild(createSafeElement('h3', { class: 'card-title' }, [name]));
            cardBody.appendChild(createSafeElement('p', { class: 'card-text' }, [description]));
            
            cardBody.appendChild(renderPriceHtml(price, discount));
    
            // Get cart item state
            const cartItem = cart.find(item => item.id === id);
            const cartItemQuantity = cartItem ? cartItem.quantity : 0;
    
            if (cartItemQuantity > 0) {
                const quantityControl = renderQuantityControl(product);
                cardBody.appendChild(quantityControl);
                // Update quantity input value
                const quantityInput = quantityControl.querySelector('.quantity-input');
                if (quantityInput) {
                    quantityInput.value = cartItemQuantity;
                }
            } else {
                const addToCartBtn = createSafeElement('button', {
                    class: 'btn btn-primary mt-2',
                    'data-id': id,
                    'aria-label': `Add ${name} to cart`
                }, ['Agregar']);
                
                addToCartBtn.addEventListener('click', () => {
                    addToCart(product, 1);
                    const quantityControl = renderQuantityControl(product);
                    addToCartBtn.replaceWith(quantityControl);
                    quantityControl.classList.add('fade-in-up');
                });
                
                cardBody.appendChild(addToCartBtn);
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
                    img.classList.remove('lazyload');
                    observer.unobserve(img);
                }
            });
        }, { rootMargin: '100px' });
    
        document.querySelectorAll('img.lazyload').forEach(img => imageObserver.observe(img));
    };

    const filterProducts = (products, keyword, sortCriterion) => {
        return products
            .filter(product => 
                (product.name.toLowerCase().includes(keyword.toLowerCase()) ||
                product.description.toLowerCase().includes(keyword.toLowerCase())) &&
                product.stock  // This ensures only in-stock items are shown
            )
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
            const filteredAndSortedProducts = memoizedFilterProducts(products, keyword, criterion);
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
            updateProductDisplay();
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
    
            if (newQuantity <= 0) {
                removeFromCart(product.id);
                updateProductDisplay(); // Refresh the entire product display
            } else if (newQuantity <= 50) {
                if (item) {
                    item.quantity = newQuantity;
                } else {
                    addToCart(product, 1);
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

    const saveCart = () => {
        try {
            localStorage.setItem('cart', JSON.stringify(cart));
        } catch (error) {
            console.error('Error al guardar el carrito:', error);
            showErrorMessage('Error al guardar el carrito. Tus cambios podrían no persistir.');
        }
    };

    const renderCart = () => {
        const cartItems = document.getElementById('cart-items');
        const cartTotal = document.getElementById('cart-total');
        cartItems.innerHTML = '';
        
        let total = 0;
        
        cart.forEach(item => {
            const discountedPrice = item.price - (item.discount || 0);
            const itemElement = createSafeElement('div', { class: 'cart-item mb-3', 'aria-label': `Cart item: ${item.name}` });
            itemElement.appendChild(createSafeElement('div', {}, [item.name]));
            
            const quantityContainer = createSafeElement('div');
            const decreaseBtn = createSafeElement('button', { 
                class: 'btn btn-sm btn-secondary decrease-quantity', 
                'data-id': item.id, 
                'aria-label': `Decrease quantity of ${item.name}`
            }, ['-']);
            const increaseBtn = createSafeElement('button', { 
                class: 'btn btn-sm btn-secondary increase-quantity', 
                'data-id': item.id, 
                'aria-label': `Increase quantity of ${item.name}`
            }, ['+']);
            const quantitySpan = createSafeElement('span', { 
                class: 'mx-2 item-quantity', 
                'aria-label': `Quantity of ${item.name}`
            }, [item.quantity.toString()]);
            
            quantityContainer.appendChild(decreaseBtn);
            quantityContainer.appendChild(quantitySpan);
            quantityContainer.appendChild(increaseBtn);
            itemElement.appendChild(quantityContainer);
            
            itemElement.appendChild(createSafeElement('div', {}, [`Precio: $${discountedPrice.toLocaleString('es-CL')}`]));
            itemElement.appendChild(createSafeElement('div', {}, [`Subtotal: $${(discountedPrice * item.quantity).toLocaleString('es-CL')}`]));
            
            const removeBtn = createSafeElement('button', { 
                class: 'btn btn-sm btn-danger remove-item', 
                'data-id': item.id, 
                'aria-label': `Remove ${item.name} from cart`
            }, ['Eliminar']);
            itemElement.appendChild(removeBtn);
            
            cartItems.appendChild(itemElement);
            
            total += discountedPrice * item.quantity;
        });
        
        cartTotal.textContent = `Total: $${total.toLocaleString('es-CL')}`;
        cartTotal.setAttribute('aria-label', `Total cart value: $${total.toLocaleString('es-CL')}`);
    };

    const submitCart = () => {
        let message = "Mi pedido:\n\n";
        cart.forEach(item => {
            const discountedPrice = item.price - (item.discount || 0);
            message += `${item.name}\n`;
            message += `Cantidad: ${item.quantity}\n`;
            message += `Precio unitario: $${discountedPrice.toLocaleString('es-CL')}\n`;
            message += `Subtotal: $${(discountedPrice * item.quantity).toLocaleString('es-CL')}\n\n`;
        });
        
        const total = cart.reduce((sum, item) => sum + (item.price - (item.discount || 0)) * item.quantity, 0);
        message += `Total: $${total.toLocaleString('es-CL')}`;
        
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
            products = products.filter(product => product.category === currentCategory);
        }

        sortOptions.addEventListener('change', debouncedUpdateProductDisplay);
        filterKeyword.addEventListener('input', debouncedUpdateProductDisplay);

        // Initial product display
        updateProductDisplay();

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
                updateQuantity({id: productId}, -1);
            } else if (target.classList.contains('increase-quantity')) {
                updateQuantity({id: productId}, 1);
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
document.addEventListener('DOMContentLoaded', function() {
    // Register service worker first
    registerServiceWorker();
    
    // Then initialize the app
    initApp().catch(error => {
        console.error('Error al inicializar la aplicación:', error);
        showErrorMessage('Error al inicializar la aplicación. Por favor, actualice la página.');
    });
});