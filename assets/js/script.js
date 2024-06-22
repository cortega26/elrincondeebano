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
                    reject(new Error(`Falló el cargar ${filename}`));
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
        } catch (error) {
            console.error('Error loadin components:', error);
        }
    }

    async function fetchProducts() {
        try {
            const response = await fetch('/Tienda-Ebano/_products/product_data.json');
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.error('Error fetching products:', error);
            return [];
        }
    }

    function renderProducts(products) {
        productContainer.empty();
        console.log('Rendering products:', products);
    
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
    }

    function sortProducts(products, criterion) {
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
    }

    function filterProducts(products, keyword, sortCriterion) {
        const filtered = products.filter(product => 
            product.name.toLowerCase().includes(keyword.toLowerCase()) ||
            product.description.toLowerCase().includes(keyword.toLowerCase())
        );
        return sortProducts(filtered, sortCriterion);
    }

    async function initialize() {
        try {
            await loadComponents();
            let products = await fetchProducts();
            const currentCategory = $('main').data('category');
            products = currentCategory ? products.filter(product => product.category === currentCategory) : products;

            renderProducts(products);

            function updateProductDisplay() {
                const criterion = sortOptions.val();
                const keyword = filterKeyword.val();
                const filteredAndSortedProducts = filterProducts(products, keyword, criterion);
                renderProducts(filteredAndSortedProducts);
            }

            sortOptions.on('change', updateProductDisplay);
            filterKeyword.on('input', updateProductDisplay);
            showInStock.on('change', updateProductDisplay);

        } catch (error) {
            console.error('Error initializing products:', error);
            productContainer.html('<p>Error loading products. Please try again later.</p>');
        }
    }

    initialize();
});