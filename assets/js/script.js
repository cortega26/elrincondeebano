$(function() {
    const navbarContainer = $("#navbar-container");
    const footerContainer = $("#footer-container");
    const productContainer = $('#product-container');
    const sortOptions = $('#sort-options');
    const filterKeyword = $('#filter-keyword');
    const showInStock = $('#show-in-stock');

    function loadComponent(container, filename) {
        return new Promise((resolve, reject) => {
            container.load(filename, (response, status, xhr) => {
                if (status === "error") {
                    console.error(`Error cargando ${filename}:`, xhr.status, xhr.statusText);
                    reject(new Error(`Falló al cargar ${filename}`));
                } else {
                    resolve();
                }
            });
        });
    }

    async function loadComponents() {
        try {
            await Promise.all([
                loadComponent(navbarContainer, "navbar.html"),
                loadComponent(footerContainer, "footer.html")
            ]);
            console.log('Components loaded successfully');
        } catch (error) {
            console.error('Error cargando componentes:', error);
            throw error;
        }
    }

    async function fetchProducts() {
        console.log('Attempting to fetch products...');
        try {
            const response = await fetch('/Tienda-Ebano/_products/product_data.json');
            console.log('Fetch response:', response);
            if (!response.ok) {
                throw new Error(`Error HTTP. Status: ${response.status}`);
            }
            const products = await response.json();
            console.log('Products fetched successfully:', products);
            return products;
        } catch (error) {
            console.error('Error fetching productos:', error);
            throw error;
        }
    }

    function renderProducts(products) {
        try {
            console.log('Rendering products. Number of products:', products.length);
            productContainer.empty();
        
            const showInStockOnly = showInStock.prop('checked');
            const filteredProducts = showInStockOnly ? products.filter(product => product.stock) : products;
            console.log('Filtered products (in stock only):', filteredProducts.length);
        
            const productHTML = filteredProducts.map(product => {
                console.log('Processing product:', product.name);
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
            console.log('Products rendered successfully');
        } catch (error) {
            console.error('Error rendering products:', error);
            throw error;
        }
    }

    function filterProducts(products, keyword, sortCriterion) {
        try {
            console.log('Filtering products. Keyword:', keyword, 'Sort criterion:', sortCriterion);
            const filtered = products.filter(product => 
                product.name.toLowerCase().includes(keyword.toLowerCase()) ||
                product.description.toLowerCase().includes(keyword.toLowerCase())
            );
            console.log('Filtered products:', filtered.length);
            return sortProducts(filtered, sortCriterion);
        } catch (error) {
            console.error('Error filtering products:', error);
            throw error;
        }
    }

    function sortProducts(products, criterion) {
        try {
            console.log('Sorting products. Criterion:', criterion);
            return products.sort((a, b) => {
                const getComparableValue = (product) => criterion.startsWith('price') ? (product.price - product.discount) : product.name;
                const valueA = getComparableValue(a);
                const valueB = getComparableValue(b);
                
                if (criterion.endsWith('asc')) {
                    return valueA < valueB ? -1 : valueA > valueB ? 1 : 0;
                } else {
                    return valueB < valueA ? -1 : valueB > valueA ? 1 : 0;
                }
            });
        } catch (error) {
            console.error('Error sorting products:', error);
            throw error;
        }
    }

    async function initialize() {
        try {
            console.log('Initializing...');
            await loadComponents();
            let products = await fetchProducts();
            console.log('Products fetched:', products.length);

            const currentCategory = $('main').data('category');
            console.log('Current category:', currentCategory);

            if (currentCategory) {
                products = products.filter(product => product.category === currentCategory);
                console.log('Filtered products for category:', products.length);
            }

            function updateProductDisplay() {
                try {
                    console.log('Updating product display...');
                    const criterion = sortOptions.val();
                    const keyword = filterKeyword.val();
                    console.log('Update parameters - Criterion:', criterion, 'Keyword:', keyword);
                    const filteredAndSortedProducts = filterProducts(products, keyword, criterion);
                    console.log('Filtered and sorted products:', filteredAndSortedProducts.length);
                    renderProducts(filteredAndSortedProducts);
                    console.log('Product display updated successfully');
                } catch (error) {
                    console.error('Error in updateProductDisplay:', error);
                    productContainer.html('<p>Error updating product display. Please try again later.</p>');
                }
            }

            sortOptions.on('change', updateProductDisplay);
            filterKeyword.on('input', updateProductDisplay);
            showInStock.on('change', updateProductDisplay);

            console.log('Event listeners attached');

            // Initial render
            updateProductDisplay();
            console.log('Initialization complete');

        } catch (error) {
            console.error('Error initializing products:', error);
            productContainer.html('<p>Error loading products. Please try again later.</p>');
        }
    }

    initialize();
});