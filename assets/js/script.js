$(function() {
    $("#navbar-container").load("navbar.html");
    $("#footer-container").load("footer.html");

    $.getJSON("/_products/product_data.json", function(products) {
        const currentCategory = $('main').data('category');
        const filteredProducts = currentCategory ? products.filter(product => product.category === currentCategory) : products;
        const productContainer = $('#product-container');

        filteredProducts.forEach(product => {
            const productCard = `
                <div class="producto col-12 col-sm-6 col-md-4 col-lg-3 mb-4 ${!product.stock ? 'agotado' : ''}">
                    <div class="card">
                        <img src="${product.image}" alt="${product.name}" class="card-img-top">
                        <div class="card-body">
                            <h3 class="card-title">${product.name}</h3>
                            <p class="card-text">${product.description}</p>
                            <span class="precio">${product.price}</span>
                        </div>
                    </div>
                </div>
            `;
            productContainer.append(productCard);
        });
    }).fail(function() {
        console.error("Failed to load product data from JSON file.");
    });
});