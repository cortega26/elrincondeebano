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

function setupDom() {
  const dom = new JSDOM(
    '<!DOCTYPE html><section aria-label="Opciones de filtrado"><div class="row"></div></section>'
  );
  global.window = dom.window;
  global.document = dom.window.document;
}

test('ensureDiscountToggle (real module) inserts a single toggle', async () => {
  setupDom();

  const { createCatalogManager } = await import('../src/js/modules/catalog-manager.mjs');
  assert.equal(typeof createCatalogManager, 'function', 'real module must be importable');

  const manager = createCatalogManager({ createSafeElement });
  manager.bindFilterEvents({ log: () => {}, onUserInteraction: () => {} });

  const first = document.getElementById('filter-discount');
  assert.ok(first, 'toggle should be created by the real module');
  assert.equal(first.getAttribute('aria-label'), 'Mostrar solo productos con descuento');
  assert.strictEqual(document.querySelectorAll('#filter-discount').length, 1);

  manager.bindFilterEvents({ log: () => {}, onUserInteraction: () => {} });
  const second = document.getElementById('filter-discount');
  assert.strictEqual(second, first, 'should return existing toggle');
  assert.strictEqual(
    document.querySelectorAll('#filter-discount').length,
    1,
    'should not duplicate toggle'
  );
});
