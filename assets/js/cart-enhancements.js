// Cart enhancements: add product thumbnails and show progress indicator on checkout
// This script runs after DOM is loaded and attaches listeners to cart interactions.
document.addEventListener('DOMContentLoaded', () => {
    // Inject CSS rules to style additional enhancements.  Putting these rules
    // inline avoids touching the main stylesheet and ensures accessibility
    // improvements apply immediately when the page loads.  If the injection
    // runs more than once, duplicate rules are harmless.
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

        /* Navigation enhancement: mega menu and responsive dropdown */
        @media (min-width: 992px) {
            .navbar .dropdown-menu {
                width: 400px;
                display: grid;
                grid-template-columns: repeat(2, 1fr);
                column-gap: 1rem;
            }
        }
        @media (max-width: 991.98px) {
            .navbar .dropdown-menu {
                width: 100%;
            }
        }

        /* Accessibility enhancement: show clear focus outlines on navigation links */
        .navbar .nav-link:focus,
        .navbar .dropdown-item:focus {
            outline: 2px solid var(--primary-color);
            outline-offset: 2px;
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

    // Accessibility enhancement: assign ARIA roles and labels to navigation
    const nav = document.querySelector('nav.navbar');
    if (nav) {
        // Mark the navigation landmark and provide a Spanish label
        nav.setAttribute('role', 'navigation');
        nav.setAttribute('aria-label', 'Navegación principal');
    }
    // Assign roles to dropdown menus for better screen reader support
    document.querySelectorAll('.navbar .dropdown-menu').forEach(menu => {
        menu.setAttribute('role', 'menu');
        menu.setAttribute('aria-label', 'Subcategorías');
    });
    // Assign menuitem role to each dropdown link
    document.querySelectorAll('.navbar .dropdown-menu .dropdown-item').forEach(item => {
        item.setAttribute('role', 'menuitem');
    });
});
