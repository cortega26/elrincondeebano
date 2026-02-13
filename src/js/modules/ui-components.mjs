import {
    normaliseAssetPath,
    buildCfSrc,
    buildCfSrcset,
    resolveAvifSrcset,
} from '../utils/image-srcset.mjs';
import { log } from '../utils/logger.mts';
import { safeReload } from '../utils/safe-reload.mjs';
import { UTILITY_CLASSES } from '../script.mjs';

const PRODUCT_IMAGE_SIZES = '(max-width: 575px) 50vw, (max-width: 991px) 45vw, 280px';
const CART_IMAGE_WIDTHS = Object.freeze([80, 120, 160]);
const DEFAULT_CURRENCY_CODE = 'CLP';

export const createSafeElement = (tag, attributes = {}, children = []) => {
    const element = document.createElement(tag);
    Object.entries(attributes).forEach(([key, value]) => {
        if (key === 'text') {
            element.textContent = value;
        } else {
            element.setAttribute(key, value);
        }
    });
    children.forEach((child) => {
        if (typeof child === 'string') {
            element.appendChild(document.createTextNode(child));
        } else {
            element.appendChild(child);
        }
    });
    return element;
};

export const markImageLoaded = (img) => {
    if (!img) return;
    img.classList.remove('is-loading');
    img.classList.add('is-loaded');
};

export const setupImageSkeleton = (img) => {
    if (!img || !img.classList.contains('product-thumb')) {
        return;
    }
    img.classList.add('is-loading');
    if (img.complete && img.naturalWidth > 0) {
        markImageLoaded(img);
        return;
    }
    img.addEventListener('load', () => markImageLoaded(img), { once: true });
    img.addEventListener('error', () => img.classList.remove('is-loading'), { once: true });
};

export const setupImageSkeletons = (root = document) => {
    if (!root || typeof root.querySelectorAll !== 'function') return;
    root.querySelectorAll('img.product-thumb').forEach(setupImageSkeleton);
};

export const createProductPicture = ({ imagePath, avifPath, alt, eager = false }) => {
    const sizes = PRODUCT_IMAGE_SIZES;
    const pictureChildren = [];
    const avifSrcset = resolveAvifSrcset(avifPath);
    if (avifSrcset) {
        pictureChildren.push(
            createSafeElement('source', {
                type: 'image/avif',
                srcset: avifSrcset,
                sizes,
            })
        );
    }
    const fallbackSrc = buildCfSrc(imagePath, { width: 320 }) || normaliseAssetPath(imagePath);
    const fallbackSrcset = buildCfSrcset(imagePath);
    const imgAttrs = {
        src: fallbackSrc || '',
        alt: alt || '',
        class: 'card-img-top product-thumb is-loading',
        loading: eager ? 'eager' : 'lazy',
        fetchpriority: eager ? 'high' : 'auto',
        decoding: 'async',
        width: '400',
        height: '400',
        sizes,
    };
    if (fallbackSrcset) {
        imgAttrs.srcset = fallbackSrcset;
    }
    const imgElement = createSafeElement('img', imgAttrs);
    setupImageSkeleton(imgElement);
    pictureChildren.push(imgElement);
    return createSafeElement('picture', {}, pictureChildren);
};

export const createCartThumbnail = ({ imagePath, avifPath, alt }) => {
    const sizes = '100px';
    const sources = [];
    const avifSrcset = resolveAvifSrcset(avifPath, CART_IMAGE_WIDTHS);
    if (avifSrcset) {
        sources.push(
            createSafeElement('source', {
                type: 'image/avif',
                srcset: avifSrcset,
                sizes,
            })
        );
    }
    const fallbackSrc =
        buildCfSrc(imagePath, { width: CART_IMAGE_WIDTHS[1] }) || normaliseAssetPath(imagePath);
    const fallbackSrcset = buildCfSrcset(imagePath, {}, CART_IMAGE_WIDTHS);
    const imgAttrs = {
        src: fallbackSrc || '',
        alt: alt || '',
        class: 'cart-item-thumb-img',
        loading: 'lazy',
        decoding: 'async',
        width: '100',
        height: '100',
        sizes,
    };
    if (fallbackSrcset) {
        imgAttrs.srcset = fallbackSrcset;
    }
    const imgElement = createSafeElement('img', imgAttrs);
    return createSafeElement('picture', {}, [...sources, imgElement]);
};

export const showErrorMessage = (message) => {
    const errorMessage = createSafeElement('div', { class: 'error-message', role: 'alert' }, [
        createSafeElement('p', {}, [message]),
        createSafeElement('button', { class: 'retry-button' }, ['Intentar nuevamente']),
    ]);
    const productContainer = document.getElementById('product-container');
    if (productContainer) {
        productContainer.innerHTML = '';
        productContainer.appendChild(errorMessage);
        const retryButton = errorMessage.querySelector('.retry-button');
        if (retryButton) {
            retryButton.addEventListener('click', safeReload);
        }
    } else {
        log('error', 'ui_product_container_missing');
    }
};

let hasLoggedCurrencyFallback = false;

const normalizeCurrencyCode = (currencyCode) => {
    if (typeof currencyCode !== 'string') {
        return DEFAULT_CURRENCY_CODE;
    }
    const trimmed = currencyCode.trim().toUpperCase();
    if (/^[A-Z]{3}$/.test(trimmed)) {
        return trimmed;
    }
    return DEFAULT_CURRENCY_CODE;
};

const createCurrencyFormatter = (currencyCode) => {
    const fallbackCode = normalizeCurrencyCode(currencyCode);
    try {
        return new Intl.NumberFormat('es-CL', {
            style: 'currency',
            currency: fallbackCode,
            minimumFractionDigits: 0,
        });
    } catch (error) {
        if (!hasLoggedCurrencyFallback) {
            const message =
                error && typeof error.message === 'string'
                    ? error.message
                    : 'Unknown currency formatter failure';
            log('warn', 'currency_formatter_fallback_clp', {
                currencyCode,
                message,
            });
            hasLoggedCurrencyFallback = true;
        }
        return new Intl.NumberFormat('es-CL', {
            style: 'currency',
            currency: DEFAULT_CURRENCY_CODE,
            minimumFractionDigits: 0,
        });
    }
};

export const renderPriceHtml = (price, discount, currencyCode = DEFAULT_CURRENCY_CODE) => {
    const numericPrice = Number(price) || 0;
    const numericDiscount = Number(discount) || 0;
    const formatter = createCurrencyFormatter(currencyCode);

    const formattedPrice = formatter.format(numericPrice);

    if (numericDiscount) {
        const discountedPrice = Math.max(numericPrice - numericDiscount, 0);
        const formattedDiscountedPrice = formatter.format(discountedPrice);

        return createSafeElement('div', { class: 'precio-container' }, [
            createSafeElement(
                'span',
                { class: 'precio-descuento', 'aria-label': 'Precio con descuento' },
                [formattedDiscountedPrice]
            ),
            createSafeElement('span', { class: 'precio-original', 'aria-label': 'Precio original' }, [
                createSafeElement('span', { class: 'tachado' }, [formattedPrice]),
            ]),
        ]);
    }

    return createSafeElement('div', { class: 'precio-container' }, [
        createSafeElement('span', { class: 'precio', 'aria-label': 'Precio' }, [formattedPrice]),
    ]);
};

export const renderQuantityControl = (product, getCartItemQuantity) => {
    const quantityControl = createSafeElement('div', {
        class: `quantity-control ${UTILITY_CLASSES ? UTILITY_CLASSES.hidden : 'is-hidden'}`,
        role: 'group',
        'aria-label': 'Seleccionar cantidad',
        'aria-live': 'polite',
    });
    const minusBtn = createSafeElement(
        'button',
        {
            class: 'quantity-btn',
            type: 'button',
            'data-action': 'decrease',
            'aria-label': 'Decrease quantity',
        },
        ['-']
    );
    const plusBtn = createSafeElement(
        'button',
        {
            class: 'quantity-btn',
            type: 'button',
            'data-action': 'increase',
            'aria-label': 'Increase quantity',
        },
        ['+']
    );

    const currentQty = typeof getCartItemQuantity === 'function' ? getCartItemQuantity(product.id) : 0;
    const input = createSafeElement('input', {
        type: 'number',
        class: 'quantity-input',
        value: Math.max(currentQty, 1),
        min: '1',
        max: '50',
        'aria-label': 'Quantity',
        'data-id': product.id,
    });

    quantityControl.appendChild(minusBtn);
    quantityControl.appendChild(input);
    quantityControl.appendChild(plusBtn);

    return quantityControl;
};

export const toggleActionArea = (btn, quantityControl, showQuantity) => {
    if (!btn || !quantityControl) return;
    const showButton = !showQuantity;
    if (UTILITY_CLASSES) {
        btn.classList.toggle(UTILITY_CLASSES.hidden, !showButton);
        btn.classList.toggle(UTILITY_CLASSES.flex, showButton);

        quantityControl.classList.toggle(UTILITY_CLASSES.hidden, !showQuantity);
        quantityControl.classList.toggle(UTILITY_CLASSES.flex, showQuantity);
    } else {
        // Fallback
        if (showButton) {
            btn.classList.remove('is-hidden');
            btn.classList.add('is-flex');
            quantityControl.classList.add('is-hidden');
            quantityControl.classList.remove('is-flex');
        } else {
            btn.classList.add('is-hidden');
            btn.classList.remove('is-flex');
            quantityControl.classList.remove('is-hidden');
            quantityControl.classList.add('is-flex');
        }
    }
};

export function setupActionArea(actionArea, product, { addToCart, updateQuantity, getCartItemQuantity }) {
    if (!actionArea) {
        return;
    }
    const addToCartBtn = actionArea.querySelector('.add-to-cart-btn');
    const quantityControl = actionArea.querySelector('.quantity-control');
    const quantityInput = quantityControl?.querySelector('.quantity-input');
    const minusBtn =
        quantityControl?.querySelector('.quantity-btn[data-action="decrease"]') ||
        quantityControl?.querySelector('.quantity-btn');
    const plusBtn =
        quantityControl?.querySelector('.quantity-btn[data-action="increase"]') ||
        quantityControl?.querySelectorAll('.quantity-btn')?.[1];

    const bind = (element, event, handler) => {
        if (!element) {
            return;
        }
        if (element.dataset.listenerAttached === 'true') {
            return;
        }
        element.addEventListener(event, handler);
        element.dataset.listenerAttached = 'true';
    };

    bind(addToCartBtn, 'click', () => {
        addToCart(product, 1);
        toggleActionArea(addToCartBtn, quantityControl, true);
    });

    bind(minusBtn, 'click', () => updateQuantity(product, -1));
    bind(plusBtn, 'click', () => updateQuantity(product, 1));
    bind(quantityInput, 'change', (event) => {
        const newQuantity = parseInt(event.target.value, 10);
        if (!Number.isFinite(newQuantity)) {
            event.target.value = Math.max(getCartItemQuantity(product.id), 1);
            return;
        }
        const currentQuantity = getCartItemQuantity(product.id);
        updateQuantity(product, newQuantity - currentQuantity);
    });

    const currentQuantity = getCartItemQuantity(product.id);
    if (quantityInput) {
        quantityInput.value = currentQuantity > 0 ? currentQuantity : 1;
    }
    toggleActionArea(addToCartBtn, quantityControl, currentQuantity > 0);
}
