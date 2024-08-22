'use strict';

// Main function to initialize the application
const initApp = async () => {
    const navbarContainer = document.getElementById('navbar-container');
    const footerContainer = document.getElementById('footer-container');
    const productContainer = document.getElementById('product-container');
    const sortOptions = document.getElementById('sort-options');
    const filterKeyword = document.getElementById('filter-keyword');
    const showInStock = document.getElementById('show-in-stock');

    let products = [];

    // Utility functions
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
            container.innerHTML = html;
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
            throw error;
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
            return products.map((product, index) => ({ ...product, id: index, originalIndex: index }));
        } catch (error) {
            console.error('Error fetching products:', error);
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
            value: '1',
            min: '1',
            max: '50',
            'aria-label': 'Quantity'
        });

        minusBtn.addEventListener('click', () => updateQuantity(product, -1));
        plusBtn.addEventListener('click', () => updateQuantity(product, 1));
        input.addEventListener('change', (e) => setQuantity(product, parseInt(e.target.value)));

        quantityControl.appendChild(minusBtn);
        quantityControl.appendChild(input);
        quantityControl.appendChild(plusBtn);

        return quantityControl;
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

            const addToCartBtn = createSafeElement('button', {
                class: 'btn btn-primary mt-2',
                'data-id': id,
                'data-name': name,
                'data-price': price - (discount || 0)
            }, ['Agregar al Carrito']);
            
            addToCartBtn.addEventListener('click', (e) => {
                e.target.style.display = 'none';
                const quantityControl = renderQuantityControl(product);
                e.target.parentNode.appendChild(quantityControl);
                quantityControl.classList.add('fade-in-up');
                addToCart(product, 1);
            });
            
            cardBody.appendChild(addToCartBtn);
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
        const lazyImages = document.querySelectorAll('img.lazyload');
        const imageObserver = new IntersectionObserver((entries, observer) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    img.src = img.dataset.src;
                    img.classList.remove('lazyload');
                    observer.unobserve(img);
                }
            });
        });

        lazyImages.forEach(img => imageObserver.observe(img));
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

    // Update product display
    const updateProductDisplay = () => {
        try {
            const criterion = sortOptions.value || 'original';
            const keyword = sanitizeHTML(filterKeyword.value.trim());
            const showOnlyInStock = showInStock.checked;
            const filteredAndSortedProducts = filterProducts(products, keyword, criterion, showOnlyInStock);
            renderProducts(filteredAndSortedProducts);
        } catch (error) {
            console.error('Error updating product display:', error);
            showErrorMessage('Error updating product display. Please try again later.');
        }
    };

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

    // Offline support
    const updateOnlineStatus = () => {
        const offlineIndicator = document.getElementById('offline-indicator');
        if (offlineIndicator) {
            offlineIndicator.style.display = navigator.onLine ? 'none' : 'block';
        }
    };

    // Shopping Cart Functions
    let cart = JSON.parse(localStorage.getItem('cart')) || [];

    function updateCartIcon() {
        const cartCount = document.getElementById('cart-count');
        const totalItems = cart.reduce((total, item) => total + item.quantity, 0);
        cartCount.textContent = totalItems;
    }

    function addToCart(product, quantity) {
        const existingItem = cart.find(item => item.id === product.id);
        if (existingItem) {
            existingItem.quantity = Math.min(existingItem.quantity + quantity, 50);
        } else {
            cart.push({ ...product, quantity: Math.min(quantity, 50) });
        }
        saveCart();
        updateCartIcon();
    }

    function removeFromCart(productId) {
        cart = cart.filter(item => item.id !== productId);
        saveCart();
        updateCartIcon();
        renderCart();
        updateProductDisplay();
    }

    function updateQuantity(product, change) {
        const item = cart.find(item => item.id === product.id);
        if (item) {
            item.quantity = Math.min(Math.max(item.quantity + change, 0), 50);
            if (item.quantity === 0) {
                removeFromCart(product.id);
            } else {
                saveCart();
                updateCartIcon();
            }
        } else {
            addToCart(product, 1);
        }
        const quantityInput = document.querySelector(`[data-id="${product.id}"] .quantity-input`);
        if (quantityInput) {
            quantityInput.value = item ? item.quantity : 1;
            quantityInput.classList.add('quantity-changed');
            setTimeout(() => quantityInput.classList.remove('quantity-changed'), 300);
        }
    }

    function setQuantity(product, newQuantity) {
        newQuantity = Math.min(Math.max(newQuantity, 0), 50);
        if (newQuantity === 0) {
            removeFromCart(product.id);
        } else {
            const item = cart.find(item => item.id === product.id);
            if (item) {
                item.quantity = newQuantity;
            } else {
                addToCart(product, newQuantity);
            }
            saveCart();
            updateCartIcon();
        }
        const quantityInput = document.querySelector(`[data-id="${product.id}"] .quantity-input`);
        if (quantityInput) {
            quantityInput.value = newQuantity;
            quantityInput.classList.add('quantity-changed');
            setTimeout(() => quantityInput.classList.remove('quantity-changed'), 300);
        }
    }

    function emptyCart() {
        cart = [];
        saveCart();
        updateCartIcon();
        renderCart();
        updateProductDisplay();
    }

    function saveCart() {
        localStorage.setItem('cart', JSON.stringify(cart));
    }

    function renderCart() {
        const cartItems = document.getElementById('cart-items');
        const cartTotal = document.getElementById('cart-total');
        cartItems.innerHTML = '';
        
        let total = 0;
        
        cart.forEach(item => {
            const itemElement = document.createElement('div');
            itemElement.className = 'cart-item mb-3';
            itemElement.innerHTML = `
                <div>${sanitizeHTML(item.name)}</div>
                <div>
                    <button class="btn btn-sm btn-secondary decrease-quantity" data-id="${item.id}">-</button>
                    <span class="mx-2">${item.quantity}</span>
                    <button class="btn btn-sm btn-secondary increase-quantity" data-id="${item.id}">+</button>
                </div>
                <div>Precio: $${item.price.toLocaleString('es-CL')}</div>
                <div>Subtotal: $${(item.price * item.quantity).toLocaleString('es-CL')}</div>
                <button class="btn btn-sm btn-danger remove-item" data-id="${item.id}">Eliminar</button>
            `;
            cartItems.appendChild(itemElement);
            
            total += item.price * item.quantity;
        });
        
        cartTotal.textContent = `Total: $${total.toLocaleString('es-CL')}`;
    }

    function submitCart() {
        let message = "Mi pedido:\n\n";
        cart.forEach(item => {
            message += `${item.name}\n`;
            message += `Cantidad: ${item.quantity}\n`;
            message += `Precio unitario: $${item.price.toLocaleString('es-CL')}\n`;
            message += `Subtotal: $${(item.price * item.quantity).toLocaleString('es-CL')}\n\n`;
        });
        
        const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
        message += `Total: $${total.toLocaleString('es-CL')}`;
        
        const encodedMessage = encodeURIComponent(message);
        window.open(`https://wa.me/56951118901?text=${encodedMessage}`, '_blank');
    }

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

        sortOptions.addEventListener('change', updateProductDisplay);
        filterKeyword.addEventListener('input', updateProductDisplay);
        showInStock.addEventListener('change', updateProductDisplay);

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
            const cartOffcanvas = new bootstrap.Offcanvas(document.getElementById('cartOffcanvas'));
            renderCart();
            cartOffcanvas.show();
        });
        
        emptyCartBtn.addEventListener('click', emptyCart);
        submitCartBtn.addEventListener('click', submitCart);
        
        document.getElementById('cart-items').addEventListener('click', (e) => {
            const productId = parseInt(e.target.dataset.id);
            if (e.target.classList.contains('decrease-quantity')) {
                const item = cart.find(item => item.id === productId);
                if (item) updateQuantity({id: productId}, -1);
            } else if (e.target.classList.contains('increase-quantity')) {
                const item = cart.find(item => item.id === productId);
                if (item) updateQuantity({id: productId}, 1);
            } else if (e.target.classList.contains('remove-item')) {
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