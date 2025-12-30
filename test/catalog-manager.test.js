const test = require('node:test');
const assert = require('node:assert');
const { JSDOM } = require('jsdom');

const createSafeElement = (tag, attributes = {}, children = []) => {
  const element = document.createElement(tag);
  Object.entries(attributes).forEach(([key, value]) => {
    if (key === 'text') {
      element.textContent = value;
    } else {
      element.setAttribute(key, value);
    }
  });
  children.forEach((child) => {
    if (typeof child === 'string') {
      element.appendChild(document.createTextNode(child));
    } else {
      element.appendChild(child);
    }
  });
  return element;
};

test('catalog manager renders and updates products', async () => {
  const dom = new JSDOM(
    `<!DOCTYPE html>
     <html>
       <body>
         <section aria-label="Opciones de filtrado"><div class="row"></div></section>
         <div id="product-container"></div>
         <select id="sort-options"><option value="original">Original</option></select>
         <input id="filter-keyword" />
         <button id="catalog-load-more" class="d-none"></button>
         <div id="catalog-sentinel"></div>
       </body>
     </html>`
  );
  global.window = dom.window;
  global.document = dom.window.document;

  const { createCatalogManager } = await import('../src/js/modules/catalog-manager.mjs');

  const stubElement = (tag) => document.createElement(tag);
  const manager = createCatalogManager({
    productContainer: document.getElementById('product-container'),
    sortOptions: document.getElementById('sort-options'),
    filterKeyword: document.getElementById('filter-keyword'),
    createSafeElement,
    createProductPicture: () => stubElement('img'),
    renderPriceHtml: () => createSafeElement('div', { class: 'price' }, []),
    renderQuantityControl: () => createSafeElement('div', { class: 'qty' }, []),
    setupActionArea: () => {},
    addToCart: () => {},
    updateQuantity: () => {},
    getCartItemQuantity: () => 0,
    filterProducts: (items) => items,
    memoize: (fn) => fn,
    debounce: (fn) => fn,
    scheduleIdle: (fn) => {
      fn();
      return 0;
    },
    cancelScheduledIdle: () => {},
    showErrorMessage: () => {},
  });

  const products = [
    {
      id: '1',
      name: 'Producto 1',
      description: 'Desc 1',
      price: 100,
      discount: 0,
      stock: true,
      image_path: 'assets/sample.webp',
      image_avif_path: '',
    },
    {
      id: '2',
      name: 'Producto 2',
      description: 'Desc 2',
      price: 200,
      discount: 0,
      stock: true,
      image_path: 'assets/sample.webp',
      image_avif_path: '',
    },
  ];

  manager.initialize(products);
  assert.strictEqual(document.querySelectorAll('[data-product-id]').length, 2);

  manager.bindFilterEvents();
  assert.ok(document.getElementById('filter-discount'));

  manager.setProducts([products[0]]);
  manager.updateProductDisplay();
  assert.strictEqual(document.querySelectorAll('[data-product-id]').length, 1);
});
