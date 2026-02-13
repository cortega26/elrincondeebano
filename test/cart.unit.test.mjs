import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createCartManager } from '../src/js/modules/cart.mjs';

function installDom() {
  const dom = new JSDOM(`<!doctype html>
    <html>
      <body>
        <span id="cart-count">0</span>
        <div id="cart-items"></div>
        <div id="cart-total"></div>
        <button id="submit-cart"></button>
        <button id="empty-cart"></button>
        <div id="payment-error"></div>
        <div id="payment-credit-container" class="d-none">
          <input type="radio" name="paymentMethod" value="Tarjeta" />
        </div>
      </body>
    </html>`);

  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  return dom;
}

function createSafeElement(tag, attributes = {}, children = []) {
  const element = document.createElement(tag);
  Object.entries(attributes || {}).forEach(([key, value]) => {
    element.setAttribute(key, String(value));
  });
  for (const child of children || []) {
    if (child === null || child === undefined) {
      continue;
    }
    if (typeof child === 'string') {
      element.appendChild(document.createTextNode(child));
      continue;
    }
    if (child?.nodeType) {
      element.appendChild(child);
    }
  }
  return element;
}

function createCartThumbnail({ imagePath, alt }) {
  const picture = document.createElement('picture');
  const img = document.createElement('img');
  if (imagePath) {
    img.setAttribute('src', imagePath);
  }
  img.setAttribute('alt', alt || '');
  picture.appendChild(img);
  return picture;
}

describe('Cart Manager', () => {
  let cartManager;
  let mockUpdateProductDisplay;
  let mockShowErrorMessage;
  let storage;

  beforeEach(() => {
    installDom();

    storage = {};
    globalThis.localStorage = {
      getItem: (key) => (Object.prototype.hasOwnProperty.call(storage, key) ? storage[key] : null),
      setItem: (key, value) => {
        storage[key] = String(value);
      },
    };

    mockUpdateProductDisplay = mock.fn();
    mockShowErrorMessage = mock.fn();

    cartManager = createCartManager({
      createSafeElement,
      createCartThumbnail,
      toggleActionArea: () => {},
      showErrorMessage: mockShowErrorMessage,
      getUpdateProductDisplay: () => mockUpdateProductDisplay,
    });
  });

  it('should initialize with an empty cart', () => {
    assert.deepEqual(cartManager.getCart(), []);
  });

  it('should add an item to the cart', () => {
    const product = { id: 'p1', name: 'Test Product', price: 1000, image_path: '/img.webp' };
    cartManager.addToCart(product, 2);

    const cart = cartManager.getCart();
    assert.equal(cart.length, 1);
    assert.equal(cart[0].id, 'p1');
    assert.equal(cart[0].quantity, 2);
  });

  it('should increment quantity if item already exists', () => {
    const product = { id: 'p1', name: 'Test Product', price: 1000, image_path: '/img.webp' };
    cartManager.addToCart(product, 1);
    cartManager.addToCart(product, 2);

    const cart = cartManager.getCart();
    assert.equal(cart.length, 1);
    assert.equal(cart[0].quantity, 3);
  });

  it('should limit quantity to 50', () => {
    const product = { id: 'p1', name: 'Test Product', price: 1000, image_path: '/img.webp' };
    cartManager.addToCart(product, 60);
    assert.equal(cartManager.getCart()[0].quantity, 50);
  });

  it('should update quantity via updateQuantity', () => {
    const product = { id: 'p1', name: 'Test Product', price: 1000, image_path: '/img.webp' };
    cartManager.addToCart(product, 1);
    cartManager.updateQuantity(product, 1);

    assert.equal(cartManager.getCart()[0].quantity, 2);
  });

  it('should remove item if quantity updates to 0', () => {
    const product = { id: 'p1', name: 'Test Product', price: 1000, image_path: '/img.webp' };
    cartManager.addToCart(product, 1);
    cartManager.updateQuantity(product, -1);

    assert.deepEqual(cartManager.getCart(), []);
  });

  it('should remove item via removeFromCart', () => {
    const product = { id: 'p1', name: 'Test Product', price: 1000, image_path: '/img.webp' };
    cartManager.addToCart(product, 1);
    cartManager.removeFromCart('p1');

    assert.deepEqual(cartManager.getCart(), []);
  });

  it('should empty cart', () => {
    cartManager.addToCart({ id: 'p1', name: 'A', price: 100, image_path: '/a.webp' }, 1);
    cartManager.addToCart({ id: 'p2', name: 'B', price: 200, image_path: '/b.webp' }, 1);
    cartManager.emptyCart();

    assert.deepEqual(cartManager.getCart(), []);
    assert.equal(mockUpdateProductDisplay.mock.calls.length, 1);
  });

  it('should normalize numeric ids loaded from storage', () => {
    storage.cart = JSON.stringify([
      { id: 101, name: 'Stored Product', price: 500, quantity: 2, image_path: '/img.webp' },
    ]);

    cartManager = createCartManager({
      createSafeElement,
      createCartThumbnail,
      toggleActionArea: () => {},
      showErrorMessage: mockShowErrorMessage,
      getUpdateProductDisplay: () => mockUpdateProductDisplay,
    });

    const cart = cartManager.getCart();
    assert.equal(cart[0].id, '101');
    assert.equal(cart[0].quantity, 2);

    cartManager.updateQuantity({ id: '101', image_path: '/img.webp' }, -1);
    assert.equal(cartManager.getCart()[0].quantity, 1);

    cartManager.removeFromCart('101');
    assert.deepEqual(cartManager.getCart(), []);
  });
});
