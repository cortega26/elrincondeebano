const test = require('node:test');
const assert = require('node:assert');
const { JSDOM } = require('jsdom');

async function loadCheckoutModule() {
  return import('../src/js/modules/checkout.mjs');
}

function installDom(html) {
  const dom = new JSDOM(html, { url: 'https://example.com/' });
  global.window = dom.window;
  global.document = dom.window.document;
  return dom;
}

test('setupCheckoutProgress disables and enables submit button based on cart and payment state', async () => {
  const { setupCheckoutProgress } = await loadCheckoutModule();
  installDom(`<!doctype html>
    <html>
      <body>
        <span id="cart-count">0</span>
        <button id="submit-cart">Enviar</button>
        <input type="radio" name="paymentMethod" id="pm-transfer" value="Transferencia" />
        <div id="payment-error">Error previo</div>
      </body>
    </html>`);

  setupCheckoutProgress();

  const submit = document.getElementById('submit-cart');
  const payment = document.getElementById('pm-transfer');
  const paymentError = document.getElementById('payment-error');

  assert.strictEqual(submit.disabled, true, 'submit should start disabled without cart/payment');
  assert.strictEqual(submit.getAttribute('aria-disabled'), 'true');

  document.dispatchEvent(
    new window.CustomEvent('cart:updated', {
      detail: { totalItems: 1 },
    })
  );
  assert.strictEqual(submit.disabled, true, 'submit stays disabled until payment is selected');

  payment.checked = true;
  payment.dispatchEvent(new window.Event('change', { bubbles: true }));

  assert.strictEqual(submit.disabled, false, 'submit enables when cart and payment are present');
  assert.strictEqual(submit.getAttribute('aria-disabled'), 'false');
  assert.strictEqual(paymentError.textContent, '', 'payment error should clear after selection');
});

test('createCheckoutSubmission handles empty cart with offcanvas fallback', async () => {
  const { createCheckoutSubmission } = await loadCheckoutModule();
  installDom(`<!doctype html>
    <html>
      <body>
        <div class="cart-empty-message" tabindex="-1"></div>
      </body>
    </html>`);

  let renderCalls = 0;
  let shownSelector = null;
  let focused = false;

  const emptyMessage = document.querySelector('.cart-empty-message');
  emptyMessage.focus = () => {
    focused = true;
  };

  const { submitCart } = createCheckoutSubmission({
    getCart: () => [],
    renderCart: () => {
      renderCalls += 1;
    },
    showOffcanvas: (selector) => {
      shownSelector = selector;
    },
  });

  submitCart();

  assert.strictEqual(renderCalls, 1, 'renderCart should run for empty cart');
  assert.strictEqual(shownSelector, '#cartOffcanvas', 'cart offcanvas should be requested');
  assert.strictEqual(focused, true, 'empty cart message should receive focus');
});

test('createCheckoutSubmission enforces payment selection before opening WhatsApp', async () => {
  const { createCheckoutSubmission } = await loadCheckoutModule();
  installDom(`<!doctype html>
    <html>
      <body>
        <div id="payment-error"></div>
        <input type="radio" name="paymentMethod" value="Transferencia" />
      </body>
    </html>`);

  let openedUrl = null;
  let paymentFocused = false;
  const paymentInput = document.querySelector('input[name="paymentMethod"]');
  paymentInput.focus = () => {
    paymentFocused = true;
  };
  window.open = (url) => {
    openedUrl = url;
  };

  const { submitCart } = createCheckoutSubmission({
    getCart: () => [{ name: 'Coca Cola', price: 2000, discount: 0, quantity: 1 }],
  });

  submitCart();

  assert.strictEqual(openedUrl, null, 'checkout should not open WhatsApp without payment');
  assert.strictEqual(
    document.getElementById('payment-error').textContent,
    'Por favor seleccione un método de pago'
  );
  assert.strictEqual(paymentFocused, true, 'first payment option should be focused');
});

test('createCheckoutSubmission builds WhatsApp order with totals and selected payment', async () => {
  const { createCheckoutSubmission } = await loadCheckoutModule();
  installDom(`<!doctype html>
    <html>
      <body>
        <div id="payment-error">Error previo</div>
        <input type="radio" name="paymentMethod" value="Transferencia" checked />
      </body>
    </html>`);

  let openedUrl = null;
  window.open = (url, target) => {
    openedUrl = { url, target };
  };

  const { submitCart } = createCheckoutSubmission({
    getCart: () => [
      { name: 'Producto A', price: 2000, discount: 500, quantity: 2 },
      { name: 'Producto B', price: 1000, discount: 0, quantity: 1 },
    ],
  });

  submitCart();

  assert.ok(openedUrl, 'checkout should open WhatsApp when payload is valid');
  assert.strictEqual(openedUrl.target, '_blank');
  assert.match(openedUrl.url, /^https:\/\/wa\.me\/56951118901\?text=/);

  const encoded = openedUrl.url.split('text=')[1];
  const decoded = decodeURIComponent(encoded);

  assert.match(decoded, /Mi pedido:/);
  assert.match(decoded, /Producto A/);
  assert.match(decoded, /Producto B/);
  assert.match(decoded, /Método de pago: Transferencia/);
  assert.match(decoded, /Total: \$4\.000/);
  assert.strictEqual(document.getElementById('payment-error').textContent, '');
});
