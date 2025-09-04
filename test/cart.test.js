const test = require('node:test');
const assert = require('node:assert');
const { JSDOM } = require('jsdom');

let addToCart, removeFromCart, updateQuantity, updateCartIcon, __getCart;

async function setupDom() {
  const dom = new JSDOM(`<!DOCTYPE html><body>
    <span id="cart-count"></span>
    <div id="cart-items"></div>
    <div id="cart-total"></div>
  </body>`, { url: 'http://localhost' });
  global.window = dom.window;
  global.document = dom.window.document;
  global.localStorage = dom.window.localStorage;

  ({ addToCart, removeFromCart, updateQuantity, updateCartIcon, __getCart, __resetCart } = await import('../src/js/script.mjs'));
  __resetCart();
}

test('cart helpers', async (t) => {
  await t.test('items accumulate with quantity caps', async () => {
    await setupDom();
    const product = { id: '1', name: 'Prod', price: 100, description: '', image_path: '', category: '', stock: 100 };

    addToCart(product, 30);
    addToCart(product, 30); // should cap at 50

    const cart = __getCart();
    assert.strictEqual(cart.length, 1);
    assert.strictEqual(cart[0].quantity, 50);
    assert.strictEqual(document.querySelector('.item-quantity').textContent, '50');
  });

  await t.test('removing or decreasing quantity updates state and DOM', async () => {
    await setupDom();
    const product = { id: '1', name: 'Prod', price: 100, description: '', image_path: '', category: '', stock: 100 };

    addToCart(product, 5);
    updateQuantity(product, -2); // decrease to 3

    let cart = __getCart();
    assert.strictEqual(cart[0].quantity, 3);
    assert.strictEqual(document.querySelector('.item-quantity').textContent, '3');

    removeFromCart(product.id);
    cart = __getCart();
    assert.strictEqual(cart.length, 0);
    assert.strictEqual(document.getElementById('cart-items').children.length, 0);
  });

  await t.test('updateCartIcon reflects total items', async () => {
    await setupDom();
    const p1 = { id: '1', name: 'P1', price: 100, description: '', image_path: '', category: '', stock: 100 };
    const p2 = { id: '2', name: 'P2', price: 200, description: '', image_path: '', category: '', stock: 100 };

    addToCart(p1, 2);
    addToCart(p2, 3);

    updateCartIcon();
    assert.strictEqual(document.getElementById('cart-count').textContent, '5');
  });
});
