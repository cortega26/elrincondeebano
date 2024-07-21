'use strict';

// Main function to initialize the application
const initApp = async () => {
    const navbarContainer = $("#navbar-container");
    const footerContainer = $("#footer-container");
    const productContainer = $('#product-container');
    const sortOptions = $('#sort-options');
    const filterKeyword = $('#filter-keyword');
    const showInStock = $('#show-in-stock');

    let products = [];

    // Utility functions
    const sanitizeHTML = (unsafe) => {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
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
    const loadComponent = (container, filename) => {
        return new Promise((resolve, reject) => {
            container.load(filename, (response, status, xhr) => {
                if (status === "error") {
                    console.error('Error loading component:', { filename, status: xhr.status, statusText: xhr.statusText });
                    reject(new Error('Failed to load component'));
                } else {
                    resolve();
                }
            });
        });
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
            return products.map((product, index) => ({ ...product, originalIndex: index }));
        } catch (error) {
            console.error('Error fetching products:', error);
            return []; // Return an empty array if there's an error
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

    // Render products
    const renderProducts = (productsToRender) => {
        const fragment = document.createDocumentFragment();
        
        productsToRender.forEach(product => {
            const { name, description, image_path, price, discount, stock } = product;
            
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
            cardElement.appendChild(cardBody);
            productElement.appendChild(cardElement);
            
            fragment.appendChild(productElement);
        });

        productContainer.empty().append(fragment);
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

    // Filter and sort products + show Only In Stock switch
    const filterProducts = (products, keyword, sortCriterion, showOnlyInStock) => {
        const safeKeyword = sanitizeHTML(keyword.toLowerCase());
        const filtered = products.filter(product => 
            (sanitizeHTML(product.name.toLowerCase()).includes(safeKeyword) ||
            sanitizeHTML(product.description.toLowerCase()).includes(safeKeyword)) &&
            (!showOnlyInStock || product.stock)
        );
        return sortProducts(filtered, sortCriterion);
    };

    const sortProducts = (products, criterion) => {
        if (!criterion || criterion === 'original') {
            return products.sort((a, b) => a.originalIndex - b.originalIndex);
        }
        return products.sort((a, b) => {
            const getComparableValue = (product) => {
                if (criterion.startsWith('price')) {
                    return product.price - (product.discount || 0);
                } else {
                    return sanitizeHTML(product.name.toLowerCase());
                }
            };
            const valueA = getComparableValue(a);
            const valueB = getComparableValue(b);
            
            return criterion.endsWith('asc') ? 
                (valueA < valueB ? -1 : valueA > valueB ? 1 : 0) :
                (valueB < valueA ? -1 : valueB > valueA ? 1 : 0);
        });
    };

    // Update product display + switch Only In Stock
    const updateProductDisplay = () => {
        try {
            const criterion = sortOptions.val() || 'original';
            const keyword = sanitizeHTML(filterKeyword.val().trim());
            const showOnlyInStock = showInStock.is(':checked');
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
        productContainer.empty().append(errorMessage);
        errorMessage.querySelector('.retry-button').addEventListener('click', initApp);
    };

    // Offline support
    const updateOnlineStatus = () => {
        const offlineIndicator = document.getElementById('offline-indicator');
        if (offlineIndicator) {
            if (navigator.onLine) {
                offlineIndicator.style.display = 'none';
            } else {
                offlineIndicator.style.display = 'block';
            }
        }
    };

    // Main initialization function
    try {
        await loadComponents();
        products = await fetchProducts();

        if (products.length === 0) {
            showErrorMessage('No products available. Please try again later.');
            return; // Exit early if no products are loaded
        }

        const currentCategory = $('main').data('category');
        if (currentCategory) {
            products = products.filter(product => sanitizeHTML(product.category) === sanitizeHTML(currentCategory));
        }

        sortOptions.on('change', updateProductDisplay);
        filterKeyword.on('input', updateProductDisplay);
        showInStock.on('change', updateProductDisplay);

        // Initial product display
        updateProductDisplay();

        // Offline support
        window.addEventListener('online', updateOnlineStatus);
        window.addEventListener('offline', updateOnlineStatus);
        updateOnlineStatus();

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
$(initApp);