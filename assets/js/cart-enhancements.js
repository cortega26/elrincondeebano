// Cart enhancements: add product thumbnails and show progress indicator on checkout
// This script runs after DOM is loaded and attaches listeners to cart interactions.
document.addEventListener('DOMContentLoaded', () => {
    // Inject a CSS rule for cart thumbnails. This avoids having to edit the
    // global stylesheet and keeps the enhancement self‑contained. If the
    // stylesheet injection has already run, it will append another copy,
    // which is harmless because CSS is idempotent for identical rules.
    {
        const styleEl = document.createElement('style');
        styleEl.textContent = `
        /* Cart enhancement: thumbnail image style */
        .cart-item-thumb {
            width: 40px;
            height: 40px;
            object-fit: cover;
            border-radius: 0.25rem;
            margin-right: 0.5rem;
        }
        `;
        document.head.appendChild(styleEl);
    }

    // Function to add thumbnails to cart items when cart is rendered
    function addThumbnailsToCart() {
        const cartItemsContainer = document.getElementById('cart-items');
        if (!cartItemsContainer) return;
        const cartData = JSON.parse(localStorage.getItem('cart') || '[]');
        // Iterate through each cart item element and inject thumbnail if missing
        cartItemsContainer.querySelectorAll('.cart-item').forEach(itemEl => {
            // Determine product ID from remove button or data attribute
            const removeBtn = itemEl.querySelector('.remove-item');
            const productId = removeBtn ? removeBtn.getAttribute('data-id') : null;
            if (!productId) return;
            // Check if thumbnail already exists
            if (!itemEl.querySelector('img.cart-item-thumb')) {
                const product = cartData.find(p => String(p.id) === String(productId));
                if (product && product.image_path) {
                    const img = document.createElement('img');
                    img.src = product.image_path;
                    img.alt = product.name;
                    img.className = 'cart-item-thumb me-2';
                    // Insert thumbnail at beginning of item element
                    itemEl.insertBefore(img, itemEl.firstChild);
                }
            }
        });
    }

    // When cart icon is clicked, wait briefly then add thumbnails
    const cartIcon = document.getElementById('cart-icon');
    if (cartIcon) {
        cartIcon.addEventListener('click', () => {
            // Give the cart some time to render items
            setTimeout(() => {
                addThumbnailsToCart();
            }, 100);
        });
    }

    // Enhance the submit button to show progress indicator during checkout
    const submitBtn = document.getElementById('submit-cart');
    if (submitBtn) {
        submitBtn.addEventListener('click', () => {
            const originalText = submitBtn.textContent;
            submitBtn.disabled = true;
            submitBtn.textContent = 'Enviando…';
            // Re-enable after a short delay; the WhatsApp window opens in new tab
            setTimeout(() => {
                submitBtn.disabled = false;
                submitBtn.textContent = originalText;
            }, 2000);
        });
    }
});
