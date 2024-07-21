'use strict';

// Main function to initialize the application
const initApp = async () => {
    const navbarContainer = $("#navbar-container");
    const footerContainer = $("#footer-container");
    const productContainer = $('#product-container');
    const sortOptions = $('#sort-options');
    const filterKeyword = $('#filter-keyword');
    const showInStock = $('#show-in-stock');

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
        throw error;
    }
};

// Render price HTML
const renderPriceHtml = (price, discount) => {
    const formattedPrice = price.toLocaleString('es-CL');
    if (discount) {
        const discountedPrice = price - discount;
        const formattedDiscountedPrice = discountedPrice.toLocaleString('es-CL');
        const formattedDiscount = discount.toLocaleString('es-CL');
        return createSafeElement('div', { class: 'precio-container' }, [
            createSafeElement('span', { class: 'precio-descuento' }, [`$${formattedDiscountedPrice}`]),
            createSafeElement('span', { class: 'ahorra' }, [`Ahorra $${formattedDiscount}`]),
            createSafeElement('span', { class: 'precio-original' }, [
                'Regular: $',
                createSafeElement('span', { class: 'tachado' }, [formattedPrice])
            ])
        ]);
    } else {
        return createSafeElement('span', { class: 'precio' }, [`$${formattedPrice}`]);
    }
};

// Render products
const renderProducts = (products) => {
    productContainer.empty();
    
    const showInStockOnly = showInStock.prop('checked');
    const filteredProducts = showInStockOnly ? products.filter(product => product.stock) : products;
    
    filteredProducts.forEach(product => {
        const { name, description, image_path, price, discount, stock } = product;
        
        const productElement = createSafeElement('div', {
            class: `producto col-12 col-sm-6 col-md-4 col-lg-3 mb-4 ${!stock ? 'agotado' : ''}`
        });

        const cardElement = createSafeElement('div', { class: 'card' });
        
        const imgElement = createSafeElement('img', {
            src: encodeURI(image_path),
            alt: sanitizeHTML(name),
            class: 'card-img-top',
            loading: 'lazy'
        });
        cardElement.appendChild(imgElement);

        const cardBody = createSafeElement('div', { class: 'card-body' });
        cardBody.appendChild(createSafeElement('h3', { class: 'card-title' }, [sanitizeHTML(name)]));
        cardBody.appendChild(createSafeElement('p', { class: 'card-text' }, [sanitizeHTML(description)]));
        
        cardBody.appendChild(renderPriceHtml(price, discount));
        cardElement.appendChild(cardBody);
        productElement.appendChild(cardElement);
        
        productContainer.append(productElement);
    });
};

// Filter and sort products
const filterProducts = (products, keyword, sortCriterion) => {
    const safeKeyword = sanitizeHTML(keyword.toLowerCase());
    const filtered = products.filter(product => 
        sanitizeHTML(product.name.toLowerCase()).includes(safeKeyword) ||
        sanitizeHTML(product.description.toLowerCase()).includes(safeKeyword)
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

// Main initialization function
try {
    await loadComponents();
    let products = await fetchProducts();

    const currentCategory = $('main').data('category');
    if (currentCategory) {
        products = products.filter(product => sanitizeHTML(product.category) === sanitizeHTML(currentCategory));
    }

    const updateProductDisplay = () => {
        try {
            const criterion = sortOptions.val() || 'original';
            const keyword = sanitizeHTML(filterKeyword.val().trim());
            const filteredAndSortedProducts = filterProducts(products, keyword, criterion);
            renderProducts(filteredAndSortedProducts);
        } catch (error) {
            console.error('Error updating product display:', error);
            productContainer.text('Error updating product display. Please try again later.');
        }
    };

    sortOptions.on('change', updateProductDisplay);
    filterKeyword.on('input', updateProductDisplay);
    showInStock.on('change', updateProductDisplay);

    // Initial product display
    updateProductDisplay();

} catch (error) {
    console.error('Error initializing products:', error);
    productContainer.text('Error loading products. Please try again later.');
}
};

// Run the application when the DOM is ready
$(initApp);