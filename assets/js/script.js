'use strict';

// Utility functions
const memoize = (fn) => {
    const cache = new Map();
    return (...args) => {
        const key = JSON.stringify(args);
        if (cache.has(key)) return cache.get(key);
        const result = fn(...args);
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

let uniqueId = 0;
const generateUniqueId = () => {
    return `product-${Date.now()}-${uniqueId++}`;
};

// Main function to initialize the application
const initApp = async () => {
    const navbarContainer = document.getElementById('navbar-container');
    const footerContainer = document.getElementById('footer-container');
    const productContainer = document.getElementById('product-container');
    const sortOptions = document.getElementById('sort-options');
    const filterKeyword = document.getElementById('filter-keyword');
    const showInStock = document.getElementById('show-in-stock');

    let products = [];
    let cart = JSON.parse(localStorage.getItem('cart')) || [];

    const updateOnlineStatus = () => {
        const offlineIndicator = document.getElementById('offline-indicator');
        if (offlineIndicator) {
            offlineIndicator.style.display = navigator.onLine ? 'none' : 'block';
        }
    };

    const sanitizeHTML = (unsafe) => {
        const element = document.createElement('div');
        element.textContent = unsafe;
        return element.innerHTML;
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

    // Load components (navbar and footer)
    const loadComponent = async (container, filename) => {
        try {
            const response = await fetch(filename);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const html = await response.text();
            
            // Use DOMParser to parse the HTML content
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            
            // Clear the container and append the new content
            container.innerHTML = '';
            Array.from(doc.body.children).forEach(child => {
                container.appendChild(child.cloneNode(true));
            });
        } catch (error) {
            console.error('Error loading component:', error);
            throw error;
        }
    };

    const loadComponents = async () => {
        try {
            await Promise.all([
                loadComponent(navbarContainer, "navbar.html"),
                loadComponent(footerContainer, "footer.html")
            ]);
            console.log('Components loaded successfully');
        } catch (error) {
            console.error('Error loading components:', error);
            showErrorMessage('Failed to load page components. Please refresh the page.');
        }
    };

    // Fetch product data
    const fetchProducts = async () => {
        try {
            const response = await fetch('/elrincondeebano/_products/product_data.json', {
                headers: {
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest'
                }
            });
            if (!response.ok) {
                throw new Error(`HTTP error. Status: ${response.status}`);
            }
            const products = await response.json();
            return products.map(product => ({ ...product, id: generateUniqueId() }));
        } catch (error) {
            console.error('Error fetching products:', error);
            showErrorMessage('Failed to load products. Please try again later.');
            throw error;
        }
    };

    // Render price HTML
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
                createSafeElement('span', { class: 'precio-descuento' }, [formattedDiscountedPrice]),
                createSafeElement('span', { class: 'ahorra' }, [`Ahorra ${formattedDiscount}`]),
                createSafeElement('span', { class: 'precio-original' }, [
                    'Regular: ',
                    createSafeElement('span', { class: 'tachado' }, [formattedPrice])
                ])
            ]);
        } else {
            return createSafeElement('span', { class: 'precio' }, [formattedPrice]);
        }
    };

    // Render quantity control
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

        quantityControl.appendChild(minusBtn);
        quantityControl.appendChild(input);
        quantityControl.appendChild(plusBtn);

        return quantityControl;
    };

    // Get cart item quantity
    const getCartItemQuantity = (productId) => {
        const item = cart.find(item => item.id === productId);
        return item ? item.quantity : 0;
    };

    // Render products
    const renderProducts = (productsToRender) => {
        const fragment = document.createDocumentFragment();
        
        productsToRender.forEach(product => {
            const { id, name, description, image_path, price, discount, stock } = product;
            
            const productElement = createSafeElement('div', {
                class: `producto col-12 col-sm-6 col-md-4 col-lg-3 mb-4 ${!stock ? 'agotado' : ''}`
            });

            const cardElement = createSafeElement('div', { class: 'card' });
            
            const imgElement = createSafeElement('img', {
                'data-src': encodeURI(image_path),
                alt: sanitizeHTML(name),
                class: 'card-img-top lazyload'
            });
            cardElement.appendChild(imgElement);

            const cardBody = createSafeElement('div', { class: 'card-body' });
            cardBody.appendChild(createSafeElement('h3', { class: 'card-title' }, [sanitizeHTML(name)]));
            cardBody.appendChild(createSafeElement('p', { class: 'card-text' }, [sanitizeHTML(description)]));
            
            cardBody.appendChild(renderPriceHtml(price, discount));

            const cartItemQuantity = getCartItemQuantity(id);
            if (cartItemQuantity > 0) {
                const quantityControl = renderQuantityControl(product);
                cardBody.appendChild(quantityControl);
            } else {
                const addToCartBtn = createSafeElement('button', {
                    class: 'btn btn-primary mt-2',
                    'data-id': id,
                    'data-name': name,
                    'data-price': price - (discount || 0)
                }, ['Agregar']);
                
                addToCartBtn.addEventListener('click', (e) => {
                    e.target.style.display = 'none';
                    const quantityControl = renderQuantityControl(product);
                    e.target.parentNode.appendChild(quantityControl);
                    quantityControl.classList.add('fade-in-up');
                    addToCart(product, 1);
                    
                    // Ensure the input shows 1 immediately after adding to cart
                    const quantityInput = quantityControl.querySelector('.quantity-input');
                    if (quantityInput) {
                        quantityInput.value = 1;
                    }
                });
                
                cardBody.appendChild(addToCartBtn);
            }

            cardElement.appendChild(cardBody);
            productElement.appendChild(cardElement);
            
            fragment.appendChild(productElement);
        });

        productContainer.innerHTML = '';
        productContainer.appendChild(fragment);
        lazyLoadImages();
    };

    // Lazy load images
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

    // Filter and sort products
    const filterProducts = (products, keyword, sortCriterion, showOnlyInStock) => {
        const safeKeyword = sanitizeHTML(keyword.toLowerCase());
        return products.filter(product => 
            (sanitizeHTML(product.name.toLowerCase()).includes(safeKeyword) ||
            sanitizeHTML(product.description.toLowerCase()).includes(safeKeyword)) &&
            (!showOnlyInStock || product.stock)
        ).sort((a, b) => sortProducts(a, b, sortCriterion));
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

    // Update product display
    const updateProductDisplay = () => {
        try {
            const criterion = sortOptions.value || 'original';
            const keyword = sanitizeHTML(filterKeyword.value.trim());
            const showOnlyInStock = showInStock.checked;
            const filteredAndSortedProducts = memoizedFilterProducts(products, keyword, criterion, showOnlyInStock);
            renderProducts(filteredAndSortedProducts);
        } catch (error) {
            console.error('Error updating product display:', error);
            showErrorMessage('Error updating product display. Please try again later.');
        }
    };

    const debouncedUpdateProductDisplay = debounce(updateProductDisplay, 300);

    // Error handling
    const showErrorMessage = (message) => {
        const errorMessage = createSafeElement('div', { class: 'error-message' }, [
            createSafeElement('p', {}, [message]),
            createSafeElement('button', { class: 'retry-button' }, ['Try Again'])
        ]);
        productContainer.innerHTML = '';
        productContainer.appendChild(errorMessage);
        errorMessage.querySelector('.retry-button').addEventListener('click', initApp);
    };

    // Shopping Cart Functions
    const updateCartIcon = () => {
        const cartCount = document.getElementById('cart-count');
        const totalItems = cart.reduce((total, item) => total + item.quantity, 0);
        cartCount.textContent = totalItems;
    };

    const addToCart = (product, quantity) => {
        try {
            const existingItem = cart.find(item => item.id === product.id);
            if (existingItem) {
                existingItem.quantity = Math.min(existingItem.quantity + quantity, 50);
            } else {
                cart.push({ ...product, quantity: Math.min(quantity, 50) });
            }
            saveCart();
            updateCartIcon();
            renderCart();
            
            const quantityInput = document.querySelector(`[data-id="${product.id}"].quantity-input`);
            if (quantityInput) {
                quantityInput.value = Math.max(getCartItemQuantity(product.id), 1);
            }
        } catch (error) {
            console.error('Error adding to cart:', error);
            showErrorMessage('Failed to add item to cart. Please try again.');
        }
    };

    const removeFromCart = (productId) => {
        try {
            cart = cart.filter(item => item.id !== productId);
            saveCart();
            updateCartIcon();
            renderCart();
            updateProductDisplay();
        } catch (error) {
            console.error('Error removing from cart:', error);
            showErrorMessage('Failed to remove item from cart. Please try again.');
        }
    };

    const updateQuantity = (product, change) => {
        try {
            const item = cart.find(item => item.id === product.id);
            if (item) {
                item.quantity = Math.min(Math.max(item.quantity + change, 0), 50);
                if (item.quantity === 0) {
                    removeFromCart(product.id);
                } else {
                    saveCart();
                    updateCartIcon();
                    renderCart();
                }
            } else {
                addToCart(product, 1);
            }
            const quantityInput = document.querySelector(`[data-id="${product.id}"].quantity-input`);
            if (quantityInput) {
                quantityInput.value = item ? item.quantity : 1;
                quantityInput.classList.add('quantity-changed');
                setTimeout(() => quantityInput.classList.remove('quantity-changed'), 300);
            }
        } catch (error) {
            console.error('Error updating quantity:', error);
            showErrorMessage('Failed to update quantity. Please try again.');
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
            console.error('Error emptying cart:', error);
            showErrorMessage('Failed to empty cart. Please try again.');
        }
    };

    const saveCart = () => {
        try {
            localStorage.setItem('cart', JSON.stringify(cart));
        } catch (error) {
            console.error('Error saving cart:', error);
            showErrorMessage('Failed to save cart. Your changes may not persist.');
        }
    };

    const renderCart = () => {
        const cartItems = document.getElementById('cart-items');
        const cartTotal = document.getElementById('cart-total');
        cartItems.innerHTML = '';
        
        let total = 0;
        
        cart.forEach(item => {
            const discountedPrice = item.price - (item.discount || 0);
            const itemElement = createSafeElement('div', { class: 'cart-item mb-3' });
            itemElement.appendChild(createSafeElement('div', {}, [sanitizeHTML(item.name)]));
            
            const quantityContainer = createSafeElement('div');
            const decreaseBtn = createSafeElement('button', { class: 'btn btn-sm btn-secondary decrease-quantity', 'data-id': item.id }, ['-']);
            const increaseBtn = createSafeElement('button', { class: 'btn btn-sm btn-secondary increase-quantity', 'data-id': item.id }, ['+']);
            const quantitySpan = createSafeElement('span', { class: 'mx-2 item-quantity' }, [item.quantity.toString()]);
            
            quantityContainer.appendChild(decreaseBtn);
            quantityContainer.appendChild(quantitySpan);
            quantityContainer.appendChild(increaseBtn);
            itemElement.appendChild(quantityContainer);
            
            itemElement.appendChild(createSafeElement('div', {}, [`Precio: $${discountedPrice.toLocaleString('es-CL')}`]));
            itemElement.appendChild(createSafeElement('div', {}, [`Subtotal: $${(discountedPrice * item.quantity).toLocaleString('es-CL')}`]));
            
            const removeBtn = createSafeElement('button', { class: 'btn btn-sm btn-danger remove-item', 'data-id': item.id }, ['Eliminar']);
            itemElement.appendChild(removeBtn);
            
            cartItems.appendChild(itemElement);
            
            total += discountedPrice * item.quantity;
        });
        
        cartTotal.textContent = `Total: $${total.toLocaleString('es-CL')}`;
    };

    const submitCart = () => {
        let message = "Mi pedido:\n\n";
        cart.forEach(item => {
            const discountedPrice = item.price - (item.discount || 0);
            message += `${sanitizeHTML(item.name)}\n`;
            message += `Cantidad: ${item.quantity}\n`;
            message += `Precio unitario: $${discountedPrice.toLocaleString('es-CL')}\n`;
            message += `Subtotal: $${(discountedPrice * item.quantity).toLocaleString('es-CL')}\n\n`;
        });
        
        const total = cart.reduce((sum, item) => sum + (item.price - (item.discount || 0)) * item.quantity, 0);
        message += `Total: $${total.toLocaleString('es-CL')}`;
        
        const encodedMessage = encodeURIComponent(message);
        window.open(`https://wa.me/56951118901?text=${encodedMessage}`, '_blank');
    };

    // Main initialization function
    try {
        await loadComponents();
        products = await fetchProducts();

        if (products.length === 0) {
            showErrorMessage('No products available. Please try again later.');
            return;
        }

        const currentCategory = document.querySelector('main').dataset.category;
        if (currentCategory) {
            products = products.filter(product => sanitizeHTML(product.category) === sanitizeHTML(currentCategory));
        }

        sortOptions.addEventListener('change', debouncedUpdateProductDisplay);
        filterKeyword.addEventListener('input', debouncedUpdateProductDisplay);
        showInStock.addEventListener('change', debouncedUpdateProductDisplay);

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
            if (typeof bootstrap !== 'undefined' && bootstrap.Offcanvas) {
                const cartOffcanvas = new bootstrap.Offcanvas(document.getElementById('cartOffcanvas'));
                renderCart();
                cartOffcanvas.show();
            } else {
                console.error('Bootstrap Offcanvas is not available');
                // Fallback behavior if Bootstrap is not loaded
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
        console.error('Error initializing products:', error);
        showErrorMessage('Error loading products. Please try again later.');
    }
};


// Run the application when the DOM is ready
document.addEventListener('DOMContentLoaded', initApp);
