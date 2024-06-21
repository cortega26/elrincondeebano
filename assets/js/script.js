$(function() {
    $("#navbar-container").load("navbar.html");
    $("#footer-container").load("footer.html");

    async function fetchProducts() {
        const response = await fetch('/Tienda-Ebano/_products/product_data.json');
        const products = await response.json();
        return products;
    }

    function renderProducts(products) {
        const productContainer = $('#product-container');
        productContainer.empty();
        console.log('Rendering products:', products);
    
        const showInStock = $('#show-in-stock').prop('checked');
        const filteredProducts = showInStock ? products.filter(product => product.stock) : products;
    
        filteredProducts.forEach(product => {
            const formattedPrice = product.price.toLocaleString('es-CL');
            const discountedPrice = product.price - product.discount;
            const formattedDiscountedPrice = discountedPrice.toLocaleString('es-CL');
            const formattedDiscount = product.discount.toLocaleString('es-CL');
            const discountHTML = product.discount ? `
                <div class="precio-container">
                    <span class="precio-descuento">$${formattedDiscountedPrice}</span>
                    <span class="ahorra">Ahorra $${formattedDiscount}</span>
                </div>
                <span class="precio-original" text-align="left">Regular: $<span class="tachado">${formattedPrice}</span></span>
            ` : `<span class="precio">$${formattedPrice}</span>`;
            const productHTML = `
                <div class="producto col-12 col-sm-6 col-md-4 col-lg-3 mb-4 ${!product.stock ? 'agotado' : ''}">
                    <div class="card">
                        <img src="${product.image_path}" alt="${product.name}" class="card-img-top">
                        <div class="card-body">
                            <h3 class="card-title">${product.name}</h3>
                            <p class="card-text">${product.description}</p>
                            ${discountHTML}
                        </div>
                    </div>
                </div>
            `;
            productContainer.append(productHTML);
        });
    }

    function sortProducts(products, criterion) {
        return products.sort((a, b) => {
            if (criterion === 'name-asc') return a.name.localeCompare(b.name);
            if (criterion === 'name-desc') return b.name.localeCompare(a.name);
            if (criterion === 'price-asc') return (a.price - b.price) - (a.discount - b.discount);
            if (criterion === 'price-desc') return b.price - a.price;
            return 0;
        });
    }

    function filterProducts(products, keyword, sortCriterion) {
        const filtered = products.filter(product => product.name.toLowerCase().includes(keyword.toLowerCase()));
        console.log(`Filtered products: ${JSON.stringify(filtered)}`);
        return sortProducts(filtered, sortCriterion);
    }

    async function initialize() {
        try {
            let products = await fetchProducts();
            const currentCategory = $('main').data('category');
            products = currentCategory ? products.filter(product => product.category === currentCategory) : products;

            // Initial render
            renderProducts(products);

            // Handle sorting and filtering concurrently
            $('#sort-options, #filter-keyword').on('change input', function() {
                const criterion = $('#sort-options').val();
                const keyword = $('#filter-keyword').val();
                const filteredAndSortedProducts = filterProducts(products, keyword, criterion);
                renderProducts(filteredAndSortedProducts);
            });

            // Handle in-stock checkbox
            $('#show-in-stock').on('change', function() {
                const criterion = $('#sort-options').val();
                const keyword = $('#filter-keyword').val();
                const filteredAndSortedProducts = filterProducts(products, keyword, criterion);
                renderProducts(filteredAndSortedProducts);
            });
        } catch (error) {
            console.error('Error initializing products:', error);
        }
    }

    initialize();
});