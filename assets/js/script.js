'use strict';

$(() => {
    const navbarContainer = $("#navbar-container");
    const footerContainer = $("#footer-container");
    const productContainer = $('#product-container');
    const sortOptions = $('#sort-options');
    const filterKeyword = $('#filter-keyword');
    const showInStock = $('#show-in-stock');

    const loadComponent = (container, filename) => {
        return new Promise((resolve, reject) => {
            container.load(filename, (response, status, xhr) => {
                if (status === "error") {
                    console.error(`Error loading ${filename}:`, xhr.status, xhr.statusText);
                    reject(new Error(`Failed to load ${filename}`));
                } else {
                    resolve();
                }
            });
        });
    };

    const loadComponents = async () => {
        try {
            await Promise.all([
                loadComponent(navbarContainer, "html/navbar.html"),
                loadComponent(footerContainer, "html/footer.html")
            ]);
            console.log('Components loaded successfully');
        } catch (error) {
            console.error('Error loading components:', error);
            throw error;
        }
    };

    const fetchProducts = async () => {
        try {
            const response = await fetch('/Tienda-Ebano/_products/product_data.json');
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

    const renderProducts = (products) => {
        productContainer.empty();
        
        const showInStockOnly = showInStock.prop('checked');
        const filteredProducts = showInStockOnly ? products.filter(product => product.stock) : products;
        
        const productHTML = filteredProducts.map(product => {
            const { name, description, image_path, price, discount, stock } = product;
            const formattedPrice = price.toLocaleString('es-CL');
            const discountedPrice = price - discount;
            const formattedDiscountedPrice = discountedPrice.toLocaleString('es-CL');
            const formattedDiscount = discount.toLocaleString('es-CL');
            
            const discountHTML = discount ? `
                <div class="precio-container">
                    <span class="precio-descuento">$${formattedDiscountedPrice}</span>
                    <span class="ahorra">Ahorra $${formattedDiscount}</span>
                </div>
                <span class="precio-original">Regular: $<span class="tachado">${formattedPrice}</span></span>
            ` : `<span class="precio">$${formattedPrice}</span>`;
            
            return `
                <div class="producto col-12 col-sm-6 col-md-4 col-lg-3 mb-4 ${!stock ? 'agotado' : ''}">
                    <div class="card">
                        <img src="${image_path}" alt="${name}" class="card-img-top">
                        <div class="card-body">
                            <h3 class="card-title">${name}</h3>
                            <p class="card-text">${description}</p>
                            ${discountHTML}
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        productContainer.html(productHTML);
    };

    const filterProducts = (products, keyword, sortCriterion) => {
        const filtered = products.filter(product => 
            product.name.toLowerCase().includes(keyword.toLowerCase()) ||
            product.description.toLowerCase().includes(keyword.toLowerCase())
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
                    return product.name.toLowerCase();
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
                products = products.filter(product => product.category === currentCategory);
            }

            const updateProductDisplay = () => {
                try {
                    const criterion = sortOptions.val() || 'original';
                    const keyword = filterKeyword.val().trim().replace(/</g, "&lt;").replace(/>/g, "&gt;");
                    const filteredAndSortedProducts = filterProducts(products, keyword, criterion);
                    renderProducts(filteredAndSortedProducts);
                } catch (error) {
                    console.error('Error updating product display:', error);
                    productContainer.html('<p>Error updating product display. Please try again later.</p>');
                }
            };

            sortOptions.on('change', updateProductDisplay);
            filterKeyword.on('input', updateProductDisplay);
            showInStock.on('change', updateProductDisplay);

            updateProductDisplay();
        } catch (error) {
            console.error('Error initializing products:', error);
            productContainer.html('<p>Error loading products. Please try again later.</p>');
        }
    };

    initialize();
});