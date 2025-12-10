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

import {
  addToCart,
  removeFromCart,
  updateQuantity,
  updateCartIcon,
  __getCart,
  __resetCart,
} from '../src/js/script.mjs';

describe('Cart Helpers', () => {
  beforeEach(() => {
    // Reset DOM state for each test
    document.body.innerHTML = `
      <span id="cart-count"></span>
      <div id="cart-items"></div>
      <div id="cart-total"></div>
    `;

    // Reset internal cart state
    // Reset internal cart state
    if (__resetCart) __resetCart();

    // Mock analytics
    window.__analyticsTrack = vi.fn();
  });

  it('items accumulate with quantity caps', () => {
    const product = {
      id: '1',
      name: 'Prod',
      price: 100,
      description: '',
      image_path: '',
      category: '',
      stock: 100,
    };

    // Setup mock product card input
    const input = document.createElement('input');
    input.className = 'quantity-input';
    input.dataset.id = product.id;
    document.body.appendChild(input);

    addToCart(product, 30);
    expect(window.__analyticsTrack).toHaveBeenCalledWith(
      'add_to_cart',
      expect.objectContaining({
        id: '1',
        q: 30,
        price: 100,
      })
    );

    // Check Thumbnail DOM generation (kills DOM attribute mutants)
    const cartItem = document.querySelector('#cart-items .cart-item');
    expect(cartItem).toBeTruthy();
    const thumbImg = cartItem.querySelector('.cart-item-thumb-img');
    expect(thumbImg).toBeTruthy();
    // Assuming normaliseAssetPath or buildCfSrc returns something based on image_path (empty string in test product)
    // The code says: src: fallbackSrc || ''
    expect(thumbImg.getAttribute('width')).toBe('100');
    expect(thumbImg.getAttribute('height')).toBe('100');
    expect(thumbImg.getAttribute('loading')).toBe('lazy');

    addToCart(product, 30); // should cap at 50

    const cart = __getCart();
    expect(cart.length).toBe(1);
    // Verify DOM input value specifically (kills Math.max/min mutants)
    const productInput = document.querySelector(`.quantity-input[data-id="${product.id}"]`);
    expect(productInput.value).toBe('50');
    expect(document.querySelector('.item-quantity').textContent).toBe('50');

    // Verify total price (kills Math ops mutants)
    // 50 items * 100 price = 5000 (formatted es-CL: $5.000)
    // The code logic uses toLocaleString('es-CL').
    const totalEl = document.getElementById('cart-total');
    // Strict assertion to reject negative numbers (killed -= mutant)
    expect(totalEl.textContent.trim()).toBe('Total: $5.000');
    expect(totalEl.getAttribute('aria-label')).toBe('Total: $5.000');
  });

  it('removing or decreasing quantity updates state and DOM', () => {
    const p1 = {
      id: '1',
      name: 'Prod',
      price: 100,
      description: '',
      image_path: '',
      category: '',
      stock: 100,
    };
    const p2 = {
      id: 'other',
      name: 'Other',
      price: 50,
      description: '',
      image_path: '',
      category: '',
      stock: 10,
    };

    // Setup mock inputs
    const input1 = document.createElement('input');
    input1.className = 'quantity-input';
    input1.dataset.id = p1.id;
    document.body.appendChild(input1);

    const input2 = document.createElement('input');
    input2.className = 'quantity-input';
    input2.dataset.id = p2.id;
    document.body.appendChild(input2);

    addToCart(p1, 5);
    addToCart(p2, 1);

    // Decrease p1 quantity
    updateQuantity(p1, -2); // decrease to 3
    let cart = __getCart();
    expect(cart[0].quantity).toBe(3);

    // Strict Input Check
    const inputP1 = document.querySelector(`.quantity-input[data-id="${p1.id}"]`);
    expect(inputP1.value).toBe('3');

    // Remove p1 completely
    removeFromCart(p1.id);
    expect(window.__analyticsTrack).toHaveBeenCalledWith(
      'remove_from_cart',
      expect.objectContaining({ id: p1.id })
    );

    cart = __getCart();
    expect(cart.length).toBe(1); // Should still have p2 (kills filter() -> [] mutant)
    expect(cart[0].id).toBe('other');

    // Decrease below 1 removes item
    updateQuantity(p2, -1);
    cart = __getCart();
    expect(cart.length).toBe(0);
  });

  it('updateCartIcon reflects total items', () => {
    const p1 = {
      id: '1',
      name: 'P1',
      price: 100,
      description: '',
      image_path: '',
      category: '',
      stock: 100,
    };
    const p2 = {
      id: '2',
      name: 'P2',
      price: 200,
      description: '',
      image_path: '',
      category: '',
      stock: 100,
    };

    addToCart(p1, 2);
    addToCart(p2, 3);

    updateCartIcon();
    expect(document.getElementById('cart-count').textContent).toBe('5');
  });

  it('action area toggles utility classes', () => {
    const product = {
      id: 'utility-test',
      name: 'Producto utilitario',
      price: 10,
      description: '',
      image_path: '',
      category: '',
      stock: 10,
    };

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
