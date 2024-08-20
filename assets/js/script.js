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
            return products.map((product, index) => ({ ...product, originalIndex: index }));
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