const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();
}

test('runAppBootstrap filters by data-category-key instead of display name', async () => {
  const dom = new JSDOM(
    `<!DOCTYPE html>
     <html>
       <body>
         <main data-category="Etiqueta Visible" data-category-key="SnacksDulces"></main>
         <div id="product-container"></div>
         <select id="sort-options"></select>
         <input id="filter-keyword" />
         <span id="cart-count"></span>
         <div id="cart-items"></div>
         <div id="cart-total"></div>
       </body>
     </html>`
  );
  global.window = dom.window;
  global.document = dom.window.document;

  const { runAppBootstrap } = await import('../src/js/modules/app-bootstrap.mjs');

  let initializedProducts = null;
  const catalogManager = {
    initialize: (products) => {
      initializedProducts = products;
    },
    bindFilterEvents: () => {},
    setupDeferredLoading: () => {},
  };

  await runAppBootstrap({
    catalogManager,
    cartManager: {},
    submitCart: () => {},
    initializeBootstrapUI: () => {},
    getSharedProductData: () => ({
      products: [
        { id: 'a', category: 'SnacksDulces' },
        { id: 'b', category: 'Bebidas' },
      ],
    }),
    normalizeString: normalize,
  });

  assert.equal(Array.isArray(initializedProducts), true);
  assert.equal(initializedProducts.length, 1);
  assert.equal(initializedProducts[0].id, 'a');
});

test('runAppBootstrap keeps backward compatibility with data-category text filter', async () => {
  const dom = new JSDOM(
    `<!DOCTYPE html>
     <html>
       <body>
         <main data-category="Lácteos"></main>
         <div id="product-container"></div>
         <select id="sort-options"></select>
         <input id="filter-keyword" />
         <span id="cart-count"></span>
         <div id="cart-items"></div>
         <div id="cart-total"></div>
       </body>
     </html>`
  );
  global.window = dom.window;
  global.document = dom.window.document;

  const { runAppBootstrap } = await import('../src/js/modules/app-bootstrap.mjs');

  let initializedProducts = null;
  const catalogManager = {
    initialize: (products) => {
      initializedProducts = products;
    },
    bindFilterEvents: () => {},
    setupDeferredLoading: () => {},
  };

  await runAppBootstrap({
    catalogManager,
    cartManager: {},
    submitCart: () => {},
    initializeBootstrapUI: () => {},
    getSharedProductData: () => ({
      products: [
        { id: 'a', category: 'Lacteos' },
        { id: 'b', category: 'Bebidas' },
      ],
    }),
    normalizeString: normalize,
  });

  assert.equal(Array.isArray(initializedProducts), true);
  assert.equal(initializedProducts.length, 1);
  assert.equal(initializedProducts[0].id, 'a');
});
