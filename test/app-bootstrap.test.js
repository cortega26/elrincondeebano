const test = require('node:test');
const assert = require('node:assert');
const { JSDOM } = require('jsdom');

test('runAppBootstrap refreshes catalog when initial products are empty', async () => {
  const dom = new JSDOM(
    `<!DOCTYPE html>
     <html>
       <body>
         <main></main>
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
  let deferredCalled = false;
  let setProductsArgs = null;
  let updateCalled = false;
  let fetchCalls = 0;
  let onlineStatusCalled = false;
  let perfCalled = false;
  let scheduleCalled = false;

  const catalogManager = {
    initialize: (products) => {
      initializedProducts = products;
    },
    bindFilterEvents: () => {},
    setupDeferredLoading: () => {
      deferredCalled = true;
    },
    setProducts: (products) => {
      setProductsArgs = products;
    },
    updateProductDisplay: () => {
      updateCalled = true;
    },
  };

  const cartManager = {
    updateCartIcon: () => {},
    renderCart: () => {},
    setupCartInteraction: () => {},
  };

  const fetchProducts = async () => {
    fetchCalls += 1;
    return [
      {
        id: 'p1',
        name: 'Producto',
        description: 'Desc',
        price: 1000,
        discount: 0,
        stock: true,
        category: 'Cat',
      },
    ];
  };

  const scheduleIdle = async (fn) => {
    scheduleCalled = true;
    await fn();
  };

  await runAppBootstrap({
    catalogManager,
    cartManager,
    submitCart: () => {},
    initializeBootstrapUI: () => {},
    getSharedProductData: () => ({ products: [] }),
    normalizeString: (value) => String(value || '').toLowerCase(),
    log: () => {},
    setupOnlineStatus: () => {
      onlineStatusCalled = true;
    },
    utilityClasses: { hidden: 'is-hidden', block: 'is-block' },
    scheduleIdle,
    fetchProducts,
    logPerformanceMetrics: () => {
      perfCalled = true;
    },
  });

  assert.deepStrictEqual(initializedProducts, []);
  assert.strictEqual(deferredCalled, true);
  assert.strictEqual(onlineStatusCalled, true);
  assert.strictEqual(scheduleCalled, true);
  assert.strictEqual(fetchCalls, 1);
  assert.ok(Array.isArray(setProductsArgs));
  assert.strictEqual(setProductsArgs.length, 1);
  assert.strictEqual(updateCalled, true);
  assert.strictEqual(perfCalled, true);
  assert.strictEqual(global.window.__APP_READY__, true);
});

test('runAppBootstrap refreshes catalog when bootstrap data is partial', async () => {
  const dom = new JSDOM(
    `<!DOCTYPE html>
     <html>
       <body>
         <main></main>
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

  let setProductsArgs = null;
  let updateCalled = false;
  let fetchCalls = 0;

  const catalogManager = {
    initialize: () => {},
    bindFilterEvents: () => {},
    setupDeferredLoading: () => {},
    setProducts: (products) => {
      setProductsArgs = products;
    },
    updateProductDisplay: () => {
      updateCalled = true;
    },
  };

  const fetchProducts = async () => {
    fetchCalls += 1;
    return [
      {
        id: 'p1',
        name: 'Producto',
        description: 'Desc',
        price: 1000,
        discount: 0,
        stock: true,
        category: 'Cat',
      },
      {
        id: 'p2',
        name: 'Producto 2',
        description: 'Desc 2',
        price: 1500,
        discount: 0,
        stock: true,
        category: 'Cat',
      },
    ];
  };

  await runAppBootstrap({
    catalogManager,
    cartManager: {},
    submitCart: () => {},
    initializeBootstrapUI: () => {},
    getSharedProductData: () => ({
      products: [
        {
          id: 'inline-1',
          name: 'Inline',
          description: 'Desc',
          price: 500,
          discount: 0,
          stock: true,
          category: 'Cat',
        },
      ],
      isPartial: true,
      total: 90,
    }),
    normalizeString: (value) => String(value || '').toLowerCase(),
    log: () => {},
    setupOnlineStatus: () => {},
    utilityClasses: { hidden: 'is-hidden', block: 'is-block' },
    scheduleIdle: async (fn) => fn(),
    fetchProducts,
    logPerformanceMetrics: () => {},
  });

  assert.strictEqual(fetchCalls, 1);
  assert.ok(Array.isArray(setProductsArgs));
  assert.strictEqual(setProductsArgs.length, 2);
  assert.strictEqual(updateCalled, true);
});
