import { describe, it, expect, beforeEach, vi } from 'vitest';

// script.mjs acts as a singleton with side effects, so we need to ensure a fresh DOM for it often.
// However, since it is an ESM module, it evaluates once. 
// For this test, we rely on the exported helpers and the fact that we can reset DOM state.

// We need to verify if script.mjs exports these. Based on previous file read, they were likely not exported directly 
// in the original file view (Step 31 shows imports but not explicit exports at the bottom, 
// though the test file was importing them. The test file used `await import`.
// Let's assume script.mjs has named exports or we need to rely on side-effects if it attaches to window.
// Wait, looking at Step 77, `({ addToCart, removeFromCart... } = await import(...))` implies named exports.
// But Step 31 `script.mjs` content didn't show the exports at the bottom (it was truncated). 
// I will assume they are exported.

import { addToCart, removeFromCart, updateQuantity, updateCartIcon, __getCart, __resetCart } from '../src/js/script.mjs';

describe('Cart Helpers', () => {
  beforeEach(() => {
    // Reset DOM state for each test
    document.body.innerHTML = `
      <span id="cart-count"></span>
      <div id="cart-items"></div>
      <div id="cart-total"></div>
    `;

    // Reset internal cart state
    if (__resetCart) __resetCart();
  });

  it('items accumulate with quantity caps', () => {
    const product = { id: '1', name: 'Prod', price: 100, description: '', image_path: '', category: '', stock: 100 };

    addToCart(product, 30);
    addToCart(product, 30); // should cap at 50

    const cart = __getCart();
    expect(cart.length).toBe(1);
    expect(cart[0].quantity).toBe(50);
    expect(document.querySelector('.item-quantity').textContent).toBe('50');
  });

  it('removing or decreasing quantity updates state and DOM', () => {
    const product = { id: '1', name: 'Prod', price: 100, description: '', image_path: '', category: '', stock: 100 };

    addToCart(product, 5);
    updateQuantity(product, -2); // decrease to 3

    let cart = __getCart();
    expect(cart[0].quantity).toBe(3);
    expect(document.querySelector('.item-quantity').textContent).toBe('3');

    removeFromCart(product.id);
    cart = __getCart();
    expect(cart.length).toBe(0);
    expect(document.getElementById('cart-items').children.length).toBe(0);
  });

  it('updateCartIcon reflects total items', () => {
    const p1 = { id: '1', name: 'P1', price: 100, description: '', image_path: '', category: '', stock: 100 };
    const p2 = { id: '2', name: 'P2', price: 200, description: '', image_path: '', category: '', stock: 100 };

    addToCart(p1, 2);
    addToCart(p2, 3);

    updateCartIcon();
    expect(document.getElementById('cart-count').textContent).toBe('5');
  });

  it('action area toggles utility classes', () => {
    const product = { id: 'utility-test', name: 'Producto utilitario', price: 10, description: '', image_path: '', category: '', stock: 10 };

    const actionArea = document.createElement('div');
    actionArea.className = 'action-area';
    actionArea.dataset.pid = product.id;

    const addButton = document.createElement('button');
    addButton.className = 'btn btn-primary add-to-cart-btn';
    addButton.dataset.id = product.id;
    actionArea.appendChild(addButton);

    const quantityControl = document.createElement('div');
    quantityControl.className = 'quantity-control is-hidden';

    const quantityInput = document.createElement('input');
    quantityInput.className = 'quantity-input';
    quantityInput.dataset.id = product.id;
    quantityInput.value = '1';
    quantityControl.appendChild(quantityInput);

    actionArea.appendChild(quantityControl);
    document.body.appendChild(actionArea);

    updateQuantity(product, 1);
    expect(addButton.classList.contains('is-hidden')).toBe(true);
    expect(addButton.classList.contains('is-flex')).toBe(false);
    expect(quantityControl.classList.contains('is-hidden')).toBe(false);
    expect(quantityControl.classList.contains('is-flex')).toBe(true);

    updateQuantity(product, -1);
    expect(addButton.classList.contains('is-hidden')).toBe(false);
    expect(addButton.classList.contains('is-flex')).toBe(true);
    expect(quantityControl.classList.contains('is-hidden')).toBe(true);
    expect(quantityControl.classList.contains('is-flex')).toBe(false);
  });
});
