const test = require('node:test');
const assert = require('node:assert');
const { JSDOM } = require('jsdom');

(async () => {
  const { createCartManager } = await import('../src/js/modules/cart.mjs');

  const createSafeElement = (tag, attributes = {}, children = []) => {
    const element = document.createElement(tag);
    Object.entries(attributes).forEach(([key, value]) => {
      element.setAttribute(key, value);
    });
    children.forEach((child) => {
      if (typeof child === 'string') {
        element.appendChild(document.createTextNode(child));
      } else if (child) {
        element.appendChild(child);
      }
    });
    return element;
  };

  const createCartThumbnail = () => {
    const picture = document.createElement('picture');
    const img = document.createElement('img');
    picture.appendChild(img);
    return picture;
  };

  const setupDom = (markup) => {
    const dom = new JSDOM(markup, { url: 'https://example.com/' });
    global.window = dom.window;
    global.document = dom.window.document;
    global.navigator = dom.window.navigator;
    global.localStorage = dom.window.localStorage;
    window.__analyticsTrack = () => {};
    return dom;
  };

  const teardownDom = (dom) => {
    dom.window.close();
    delete global.window;
    delete global.document;
    delete global.navigator;
    delete global.localStorage;
  };

  test('renderCart shows empty state and disables controls', () => {
    const dom = setupDom(`<!DOCTYPE html>
      <body>
        <span id="cart-count" data-initialized="0"></span>
        <div id="cart-items"></div>
        <div id="cart-total"></div>
        <div id="payment-error">error</div>
        <div id="payment-credit-container">
          <input type="radio" name="paymentMethod" checked>
        </div>
        <input type="radio" name="paymentMethod" id="payment-cash">
        <button id="submit-cart"></button>
        <button id="empty-cart"></button>
      </body>`);

    const cartManager = createCartManager({
      createSafeElement,
      createCartThumbnail,
      toggleActionArea: () => {},
      showErrorMessage: () => {},
    });

    cartManager.renderCart();

    const emptyMessage = document.querySelector('.cart-empty-message');
    assert.ok(emptyMessage);
    assert.strictEqual(
      document.getElementById('cart-total').textContent,
      'Total: $0'
    );

    const submit = document.getElementById('submit-cart');
    const emptyCart = document.getElementById('empty-cart');
    assert.strictEqual(submit.disabled, true);
    assert.strictEqual(emptyCart.disabled, true);

    const paymentInputs = document.querySelectorAll('input[name="paymentMethod"]');
    paymentInputs.forEach((input) => {
      assert.strictEqual(input.disabled, true);
      assert.strictEqual(input.checked, false);
    });

    assert.strictEqual(
      document.getElementById('payment-credit-container').classList.contains('d-none'),
      true
    );
    assert.strictEqual(document.getElementById('payment-error').textContent, '');

    teardownDom(dom);
  });

  test('renderCart enables controls when items exist', () => {
    const dom = setupDom(`<!DOCTYPE html>
      <body>
        <span id="cart-count" data-initialized="0"></span>
        <div id="cart-items"></div>
        <div id="cart-total"></div>
        <div id="payment-error"></div>
        <div id="payment-credit-container" class="d-none">
          <input type="radio" name="paymentMethod" id="payment-credit">
        </div>
        <input type="radio" name="paymentMethod" id="payment-cash">
        <button id="submit-cart"></button>
        <button id="empty-cart"></button>
      </body>`);

    const cartManager = createCartManager({
      createSafeElement,
      createCartThumbnail,
      toggleActionArea: () => {},
      showErrorMessage: () => {},
    });

    cartManager.addToCart(
      {
        id: 'p1',
        name: 'Producto',
        price: 35000,
        discount: 0,
        image_path: '',
        category: 'Test',
        stock: true,
      },
      1
    );

    assert.strictEqual(document.getElementById('cart-count').textContent, '1');
    assert.strictEqual(
      document.getElementById('cart-count').getAttribute('aria-label'),
      '1 producto en el carrito'
    );

    const emptyMessage = document.querySelector('.cart-empty-message');
    assert.strictEqual(emptyMessage, null);

    const submit = document.getElementById('submit-cart');
    const emptyCart = document.getElementById('empty-cart');
    assert.strictEqual(submit.disabled, false);
    assert.strictEqual(emptyCart.disabled, false);

    const paymentInputs = document.querySelectorAll('input[name="paymentMethod"]');
    paymentInputs.forEach((input) => {
      assert.strictEqual(input.disabled, false);
    });

    assert.strictEqual(
      document.getElementById('payment-credit-container').classList.contains('d-none'),
      false
    );

    teardownDom(dom);
  });

  test('setupCartInteraction handles item controls and empty cart action', () => {
    const dom = setupDom(`<!DOCTYPE html>
      <body>
        <span id="cart-count" data-initialized="0"></span>
        <div id="cart-items"></div>
        <div id="cart-total"></div>
        <div id="payment-error"></div>
        <div id="payment-credit-container" class="d-none">
          <input type="radio" name="paymentMethod" id="payment-credit">
        </div>
        <input type="radio" name="paymentMethod" id="payment-cash">
        <button id="submit-cart"></button>
        <button id="empty-cart"></button>
      </body>`);

    let updateCalls = 0;
    const cartManager = createCartManager({
      createSafeElement,
      createCartThumbnail,
      toggleActionArea: () => {},
      showErrorMessage: () => {},
      getUpdateProductDisplay: () => () => {
        updateCalls += 1;
      },
    });

    const product = {
      id: 'p1',
      name: 'Producto',
      price: 1200,
      discount: 0,
      image_path: '',
      category: 'Test',
      stock: true,
    };

    cartManager.addToCart(product, 1);
    cartManager.setupCartInteraction();

    const increase = document.querySelector('.increase-quantity');
    increase.dispatchEvent(new window.Event('click', { bubbles: true }));
    assert.strictEqual(cartManager.getCart()[0].quantity, 2);

    const decrease = document.querySelector('.decrease-quantity');
    decrease.dispatchEvent(new window.Event('click', { bubbles: true }));
    assert.strictEqual(cartManager.getCart()[0].quantity, 1);

    const remove = document.querySelector('.remove-item');
    remove.dispatchEvent(new window.Event('click', { bubbles: true }));
    assert.strictEqual(cartManager.getCart().length, 0);

    cartManager.addToCart(product, 1);
    global.confirm = () => true;
    document
      .getElementById('empty-cart')
      .dispatchEvent(new window.Event('click', { bubbles: true }));

    assert.strictEqual(cartManager.getCart().length, 0);
    assert.strictEqual(updateCalls, 1);

    teardownDom(dom);
  });
})();
