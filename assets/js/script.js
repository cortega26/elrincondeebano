'use strict';

$(() => {
    const navbarContainer = $("#navbar-container");
    const footerContainer = $("#footer-container");
    const productContainer = $('#product-container');
    const sortOptions = $('#sort-options');
    const filterKeyword = $('#filter-keyword');
    const showInStock = $('#show-in-stock');

    const sanitizeHTML = (unsafe) => {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    };

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

    const fetchProducts = async () => {
        try {
            const response = await fetch('/Tienda-Ebano/_products/product_data.json', {
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

    const renderPriceHtml = (price, discount) => {
        const formattedPrice = price.toLocaleString('es-CL');
        if (discount) {
            const discountedPrice = price - discount;
            const formattedDiscountedPrice = discountedPrice.toLocaleString('es-CL');
            const formattedDiscount = discount.toLocaleString('es-CL');
            return `
                <div class="precio-container">
                    <span class="precio-descuento">$${formattedDiscountedPrice}</span>
                    <span class="ahorra">Ahorra $${formattedDiscount}</span>
                </div>
                <span class="precio-original">Regular: $<span class="tachado">${formattedPrice}</span></span>
            `;
        } else {
            return `<span class="precio">$${formattedPrice}</span>`;
        }
    };

    const renderProducts = (products) => {
        productContainer.empty();
        
        const showInStockOnly = showInStock.prop('checked');
        const filteredProducts = showInStockOnly ? products.filter(product => product.stock) : products;
        
        filteredProducts.forEach(product => {
            const { name, description, image_path, price, discount, stock } = product;
            
            const productElement = $('<div>', {
                class: `producto col-12 col-sm-6 col-md-4 col-lg-3 mb-4 ${!stock ? 'agotado' : ''}`
            });

            const cardElement = $('<div>', { class: 'card' });
            
            $('<img>', {
                src: encodeURI(image_path),
                alt: sanitizeHTML(name),
                class: 'card-img-top'
            }).appendTo(cardElement);

            const cardBody = $('<div>', { class: 'card-body' });
            $('<h3>', { class: 'card-title', text: sanitizeHTML(name) }).appendTo(cardBody);
            $('<p>', { class: 'card-text', text: sanitizeHTML(description) }).appendTo(cardBody);
            
            cardBody.append(renderPriceHtml(price, discount));
            cardElement.append(cardBody);
            productElement.append(cardElement);
            
            productContainer.append(productElement);
        });
    };

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

    const initialize = async () => {
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

            updateProductDisplay();
        } catch (error) {
            console.error('Error initializing products:', error);
            productContainer.text('Error loading products. Please try again later.');
        }
    };

    initialize();
});