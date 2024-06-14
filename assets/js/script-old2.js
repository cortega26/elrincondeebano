$(function() {
    $("#navbar-container").load("navbar.html");
    $("#footer-container").load("footer.html");

    async function fetchProducts() {
        const response = await fetch('_products/product_data.json');
        const products = await response.json();
        return products;
    }

    function renderProducts(products) {
        const productContainer = $('#product-container');
        productContainer.empty();

        const showInStock = $('#show-in-stock').prop('checked');
        const filteredProducts = showInStock ? products.filter(product => product.stock) : products;

        filteredProducts.forEach(product => {
            const productHTML = `
                <div class="producto col-12 col-sm-6 col-md-4 col-lg-3 mb-4">
                    <div class="card">
                        <img src="${product.image_path}" alt="${product.name}" class="card-img-top">
                        <div class="card-body">
                            <h3 class="card-title">${product.name}</h3>
                            <p class="card-text">${product.description}</p>
                            <span class="precio">$${product.price.toFixed(0)}</span>
                            <span class="stock">${product.stock ? 'En stock' : 'Agotado'}</span>
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
            if (criterion === 'price-asc') return a.price - b.price;
            if (criterion === 'price-desc') return b.price - a.price;
        });
    }

    function filterProducts(products, keyword) {
        return products.filter(product => product.name.toLowerCase().includes(keyword.toLowerCase()));
    }

    async function initialize() {
        try {
            let products = await fetchProducts();

            // Initial render
            renderProducts(products);

            // Handle sorting
            $('#sort-options').on('change', function() {
                const criterion = $(this).val();
                const sortedProducts = sortProducts(products, criterion);
                renderProducts(sortedProducts);
            });

            // Handle filtering
            $('#filter-keyword').on('input', function() {
                const keyword = $(this).val();
                const filteredProducts = filterProducts(products, keyword);
                const sortedFilteredProducts = sortProducts(filteredProducts, $('#sort-options').val());
                renderProducts(sortedFilteredProducts);
            });

            // Handle in-stock checkbox
            $('#show-in-stock').on('change', function() {
                renderProducts(products);
            });
        } catch (error) {
            console.error('Error initializing products:', error);
        }
    }

    initialize();
});