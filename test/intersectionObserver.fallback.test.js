const assert = require('assert');
const { JSDOM } = require('jsdom');

(async () => {
  // Build a minimal DOM that exercises setupDeferredLoading + lazyLoadImages paths
  const html = `<!DOCTYPE html>
  <html><body>
    <div id="product-container"></div>
    <select id="sort-options"></select>
    <input id="filter-keyword"/>
    <span id="cart-count">0</span>
    <div id="cart-items"></div>
    <div id="cart-total"></div>
    <button id="catalog-load-more" class="d-none"></button>
    <div id="catalog-sentinel"></div>
    <img class="lazyload" data-src="/x.jpg" data-srcset="/x-200.jpg 200w, /x-400.jpg 400w" data-sizes="100px">
  </body></html>`;

  const dom = new JSDOM(html, { url: 'http://localhost/' });
  global.window = dom.window;
  global.document = dom.window.document;
  // No IntersectionObserver available in this environment
  delete global.window.IntersectionObserver;
  global.navigator = { onLine: true }; // avoid SW registration path
  global.localStorage = { getItem: () => null, setItem: () => {} };

  // Provide shared product data so initApp doesn't fetch
  const PRODUCT_DATA_GLOBAL_KEY = '__PRODUCT_DATA__';
  global.window[PRODUCT_DATA_GLOBAL_KEY] = {
    products: [
      { id: 'p1', name: 'Producto', description: 'Desc', price: 1000, discount: 0, stock: true, image_path: 'assets/sample.webp', category: 'Cat' },
    ],
    version: 'test'
  };

  const mod = await import('../src/js/script.mjs');
  // Should not throw even without IntersectionObserver
  await mod.initApp();

  // Fallback eager load should have removed lazyload class
  const img = document.querySelector('img');
  assert.ok(img && !img.classList.contains('lazyload'), 'image should be upgraded eagerly without IO');

  console.log('intersectionObserver.fallback.test.js passed');
})();

