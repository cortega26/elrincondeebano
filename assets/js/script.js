$(function() {
    $("#navbar-container").load("navbar.html");
    $("#footer-container").load("footer.html");

    $.getJSON("/Tienda-Ebano/_products/product_data.json", function(products) {
        const currentCategory = $('main').data('category');
        const filteredProducts = currentCategory ? products.filter(product => product.category === currentCategory) : products;
        const productContainer = $('#product-container');

        function renderProducts(products) {
            productContainer.empty();
            products.forEach(product => {
                const formattedPrice = product.price.toLocaleString('es-CL');
                const productCard = `
                    <div class="producto col-12 col-sm-6 col-md-4 col-lg-3 mb-4 ${!product.stock ? 'agotado' : ''}">
                        <div class="card">
                            <img src="${product.image_path}" alt="${product.name}" class="card-img-top">
                            <div class="card-body">
                                <h3 class="card-title">${product.name}</h3>
                                <p class="card-text">${product.description}</p>
                                <span class="precio">$${formattedPrice}</span>
                            </div>
                        </div>
                    </div>
                `;
                productContainer.append(productCard);
            });
        }

        $('#sort-options').on('change', function() {
            const selectedOption = $(this).val();
            let sortedProducts = [...filteredProducts];

            switch (selectedOption) {
                case 'name-asc':
                    sortedProducts.sort((a, b) => a.name.localeCompare(b.name));
                    break;
                case 'name-desc':
                    sortedProducts.sort((a, b) => b.name.localeCompare(a.name));
                    break;
                case 'price-asc':
                    sortedProducts.sort((a, b) => a.price - b.price);
                    break;
                case 'price-desc':
                    sortedProducts.sort((a, b) => b.price - a.price);
                    break;
                default:
                    // No sorting, use the original order
                    break;
            }

            renderProducts(sortedProducts);
        });

        renderProducts(filteredProducts);
    }).fail(function() {
        console.error("Failed to load product data from JSON file.");
    });
});