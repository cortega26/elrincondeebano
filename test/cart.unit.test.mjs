
import { test, describe, it, beforeEach, mock } from 'node:test'; // Requires Node 20+ or polyfill for mock
import assert from 'node:assert/strict';
import { createCartManager } from '../src/js/modules/cart.mjs';

// Mock Browser APIs
globalThis.localStorage = {
    getItem: () => null,
    setItem: () => { },
};

globalThis.document = {
    getElementById: () => ({
        dataset: {},
        setAttribute: () => { },
        classList: { remove: () => { }, add: () => { } },
        addEventListener: () => { },
    }),
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => ({ classList: { add: () => { } } }),
};

globalThis.window = {
    location: { pathname: '/' },
};

describe('Cart Manager', () => {
    let cartManager;
    let mockUpdateProductDisplay;
    let mockShowErrorMessage;

    beforeEach(() => {
        // Reset stored cart
        globalThis.localStorage.getItem = () => null;

        // Mock dependencies
        mockUpdateProductDisplay = mock.fn();
        mockShowErrorMessage = mock.fn();

        cartManager = createCartManager({
            createSafeElement: (tag) => ({ tag, appendChild: () => { }, classList: { add: () => { } } }), // Minimal mock
            createCartThumbnail: () => ({ q: 'img' }),
            toggleActionArea: () => { },
            showErrorMessage: mockShowErrorMessage,
            getUpdateProductDisplay: () => mockUpdateProductDisplay,
        });
    });

    it('should initialize with an empty cart', () => {
        assert.deepEqual(cartManager.getCart(), []);
    });

    it('should add an item to the cart', () => {
        const product = { id: 'p1', name: 'Test Product', price: 1000 };
        cartManager.addToCart(product, 2);

        const cart = cartManager.getCart();
        assert.equal(cart.length, 1);
        assert.equal(cart[0].id, 'p1');
        assert.equal(cart[0].quantity, 2);
    });

    it('should increment quantity if item already exists', () => {
        const product = { id: 'p1', name: 'Test Product', price: 1000 };
        cartManager.addToCart(product, 1);
        cartManager.addToCart(product, 2);

        const cart = cartManager.getCart();
        assert.equal(cart.length, 1);
        assert.equal(cart[0].quantity, 3);
    });

    it('should limit quantity to 50', () => {
        const product = { id: 'p1', name: 'Test Product', price: 1000 };
        cartManager.addToCart(product, 60);
        assert.equal(cartManager.getCart()[0].quantity, 50);
    });

    it('should update quantity via updateQuantity', () => {
        const product = { id: 'p1', name: 'Test Product', price: 1000 };
        cartManager.addToCart(product, 1);
        cartManager.updateQuantity(product, 1); // +1

        assert.equal(cartManager.getCart()[0].quantity, 2);
    });

    it('should remove item if quantity updates to 0', () => {
        const product = { id: 'p1', name: 'Test Product', price: 1000 };
        cartManager.addToCart(product, 1);
        cartManager.updateQuantity(product, -1);

        assert.deepEqual(cartManager.getCart(), []);
    });

    it('should remove item via removeFromCart', () => {
        const product = { id: 'p1', name: 'Test Product', price: 1000 };
        cartManager.addToCart(product, 1);
        cartManager.removeFromCart('p1');

        assert.deepEqual(cartManager.getCart(), []);
    });

    it('should empty cart', () => {
        cartManager.addToCart({ id: 'p1', price: 100 }, 1);
        cartManager.addToCart({ id: 'p2', price: 200 }, 1);
        cartManager.emptyCart();

        assert.deepEqual(cartManager.getCart(), []);
    });

    it('should normalize numeric ids loaded from storage', () => {
        globalThis.localStorage.getItem = () =>
            JSON.stringify([{ id: 101, name: 'Stored Product', price: 500, quantity: 2 }]);

        cartManager = createCartManager({
            createSafeElement: (tag) => ({ tag, appendChild: () => { }, classList: { add: () => { } } }),
            createCartThumbnail: () => ({ q: 'img' }),
            toggleActionArea: () => { },
            showErrorMessage: mockShowErrorMessage,
            getUpdateProductDisplay: () => mockUpdateProductDisplay,
        });

        const cart = cartManager.getCart();
        assert.equal(cart[0].id, '101');
        assert.equal(cart[0].quantity, 2);

        cartManager.updateQuantity({ id: '101' }, -1);
        assert.equal(cartManager.getCart()[0].quantity, 1);

        cartManager.removeFromCart('101');
        assert.deepEqual(cartManager.getCart(), []);
    });
});
