/**
 * Enhanced JavaScript for El Rincón de Ébano
 * Modern UX/UI improvements and animations
 */

'use strict';

// Enhanced utility functions
const enhancedUtils = {
    // Smooth scroll to element
    smoothScroll: (element, offset = 0) => {
        const elementPosition = element.offsetTop - offset;
        window.scrollTo({
            top: elementPosition,
            behavior: 'smooth'
        });
    },

    // Debounce function for performance
    debounce: (func, delay) => {
        let timeoutId;
        return (...args) => {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => func.apply(this, args), delay);
        };
    },

    // Check if element is in viewport
    isInViewport: (element) => {
        const rect = element.getBoundingClientRect();
        return (
            rect.top >= 0 &&
            rect.left >= 0 &&
            rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
            rect.right <= (window.innerWidth || document.documentElement.clientWidth)
        );
    }
};

// Enhanced product animations
const productAnimations = {
    init: () => {
        const products = document.querySelectorAll('.producto');

        products.forEach((product, index) => {
            // Stagger animation on load
            product.style.animationDelay = `${index * 0.1}s`;
            product.classList.add('fade-in-up');

            // Add hover effects
            product.addEventListener('mouseenter', () => {
                productAnimations.onHover(product);
            });

            product.addEventListener('mouseleave', () => {
                productAnimations.onLeave(product);
            });
        });
    },

    onHover: (product) => {
        const img = product.querySelector('img');
        const card = product.querySelector('.card');

        if (img) {
            img.style.transform = 'scale(1.05)';
        }

        if (card) {
            card.style.transform = 'translateY(-8px)';
        }
    },

    onLeave: (product) => {
        const img = product.querySelector('img');
        const card = product.querySelector('.card');

        if (img) {
            img.style.transform = 'scale(1)';
        }

        if (card) {
            card.style.transform = 'translateY(0)';
        }
    }
};

// Enhanced search functionality
const enhancedSearch = {
    init: () => {
        const searchInput = document.getElementById('filter-keyword');
        const sortSelect = document.getElementById('sort-options');

        if (searchInput) {
            searchInput.addEventListener('input',
                enhancedUtils.debounce(enhancedSearch.handleSearch, 300)
            );
        }

        if (sortSelect) {
            sortSelect.addEventListener('change', enhancedSearch.handleSort);
        }
    },

    handleSearch: (event) => {
        const query = event.target.value.toLowerCase().trim();
        const productContainer = document.getElementById('product-container');

        if (query.length > 0) {
            enhancedLoading.show(productContainer);
            setTimeout(() => {
                enhancedSearch.filterProducts(query);
                enhancedLoading.hide(productContainer);
            }, 300);
        } else {
            enhancedSearch.filterProducts(query);
        }
    },

    handleSort: () => {
        const sortValue = document.getElementById('sort-options').value;
        const productContainer = document.getElementById('product-container');

        enhancedLoading.show(productContainer);
        setTimeout(() => {
            enhancedSearch.sortProducts(sortValue);
            enhancedLoading.hide(productContainer);
        }, 300);
    },

    filterProducts: (query) => {
        const allProducts = document.querySelectorAll('.producto');

        allProducts.forEach(product => {
            const title = product.querySelector('.card-title')?.textContent.toLowerCase() || '';
            const description = product.querySelector('.card-text')?.textContent.toLowerCase() || '';

            const matches = title.includes(query) || description.includes(query);

            if (matches) {
                product.style.display = 'block';
                product.classList.add('fade-in-up');
            } else {
                product.style.display = 'none';
            }
        });
    },

    sortProducts: (sortValue) => {
        const productContainer = document.getElementById('product-container');
        const products = Array.from(productContainer.querySelectorAll('.producto'));

        products.sort((a, b) => {
            switch (sortValue) {
                case 'name-asc':
                    return a.querySelector('.card-title').textContent.localeCompare(
                        b.querySelector('.card-title').textContent
                    );
                case 'name-desc':
                    return b.querySelector('.card-title').textContent.localeCompare(
                        a.querySelector('.card-title').textContent
                    );
                case 'price-asc':
                    return parseFloat(a.dataset.price) - parseFloat(b.dataset.price);
                case 'price-desc':
                    return parseFloat(b.dataset.price) - parseFloat(a.dataset.price);
                default:
                    return 0;
            }
        });

        products.forEach(product => {
            productContainer.appendChild(product);
        });
    }
};

// Enhanced image loading
const enhancedImages = {
    init: () => {
        const images = document.querySelectorAll('img[data-src]');

        const imageObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    const src = img.dataset.src;

                    img.src = src;
                    img.classList.add('fade-in-up');

                    img.addEventListener('load', () => {
                        img.classList.remove('lazyload');
                        img.classList.add('lazyloaded');
                    });

                    imageObserver.unobserve(img);
                }
            });
        }, {
            rootMargin: '50px 0px',
            threshold: 0.01
        });

        images.forEach(img => imageObserver.observe(img));
    }
};

// Enhanced mobile experience
const mobileEnhancements = {
    init: () => {
        if (window.innerWidth <= 768) {
            mobileEnhancements.optimizeForTouch();
        }
    },

    optimizeForTouch: () => {
        // Increase touch targets
        const buttons = document.querySelectorAll('.btn, .quantity-btn');
        buttons.forEach(button => {
            button.style.minHeight = '44px';
            button.style.minWidth = '44px';
        });
    }
};

// Enhanced cart functionality
const enhancedCart = {
    init: () => {
        enhancedCart.addCartAnimations();
    },

    addCartAnimations: () => {
        const cartItems = document.getElementById('cart-items');
        if (cartItems) {
            const observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                        mutation.addedNodes.forEach((node) => {
                            if (node.classList && node.classList.contains('cart-item')) {
                                node.classList.add('fade-in-up');
                            }
                        });
                    }
                });
            });

            observer.observe(cartItems, { childList: true, subtree: true });
        }
    }
};

// Enhanced loading states
const enhancedLoading = {
    show: (container) => {
        container.innerHTML = `
      <div class="loading-container">
        <div class="loading-skeleton"></div>
        <div class="loading-skeleton"></div>
        <div class="loading-skeleton"></div>
        <div class="loading-skeleton"></div>
      </div>
    `;
    },

    hide: (container) => {
        const loadingElements = container.querySelectorAll('.loading-skeleton');
        loadingElements.forEach(el => el.remove());
    }
};

// Enhanced notifications
const enhancedNotifications = {
    show: (message, type = 'info') => {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
      <div class="notification-content">
        <span>${message}</span>
        <button class="notification-close">&times;</button>
      </div>
    `;

        document.body.appendChild(notification);

        setTimeout(() => {
            notification.remove();
        }, 5000);
    }
};

// Enhanced accessibility
const enhancedAccessibility = {
    init: () => {
        enhancedAccessibility.addKeyboardNavigation();
        enhancedAccessibility.addFocusIndicators();
    },

    addKeyboardNavigation: () => {
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Tab') {
                document.body.classList.add('keyboard-navigation');
            }
        });

        document.addEventListener('mousedown', () => {
            document.body.classList.remove('keyboard-navigation');
        });
    },

    addFocusIndicators: () => {
        const style = document.createElement('style');
        style.textContent = `
      .keyboard-navigation *:focus {
        outline: 2px solid var(--primary-color);
        outline-offset: 2px;
      }
    `;
        document.head.appendChild(style);
    }
};

// Enhanced performance monitoring
const performanceMonitor = {
    init: () => {
        if ('performance' in window) {
            window.addEventListener('load', () => {
                const paintEntries = performance.getEntriesByType('paint');
                const navigationEntries = performance.getEntriesByType('navigation');

                console.log('Performance Metrics:', {
                    firstPaint: paintEntries[0]?.startTime,
                    firstContentfulPaint: paintEntries[1]?.startTime,
                    domContentLoaded: navigationEntries[0]?.domContentLoadedEventEnd,
                    loadComplete: navigationEntries[0]?.loadEventEnd
                });
            });
        }
    }
};

// Initialize all enhancements
const initEnhancedFeatures = () => {
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initFeatures);
    } else {
        initFeatures();
    }

    function initFeatures() {
        // Initialize all enhancements
        productAnimations.init();
        enhancedSearch.init();
        enhancedImages.init();
        mobileEnhancements.init();
        enhancedCart.init();
        enhancedAccessibility.init();
        performanceMonitor.init();

        console.log('Enhanced features initialized');
    }
};

// Export for use in other files
window.enhancedFeatures = {
    initEnhancedFeatures,
    enhancedUtils,
    enhancedSearch,
    enhancedCart,
    enhancedNotifications
};

// Auto-initialize
initEnhancedFeatures();
