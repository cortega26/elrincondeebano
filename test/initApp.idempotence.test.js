const test = require('node:test');
const assert = require('node:assert');
const { JSDOM } = require('jsdom');

function setupDom() {
  const dom = new JSDOM(
    `<!DOCTYPE html>
     <html>
       <body>
         <main></main>
         <div id="product-container"></div>
         <select id="sort-options"><option value="name">Nombre</option></select>
         <input id="filter-keyword" />
         <span id="cart-count"></span>
         <div id="cart-items"></div>
         <div id="cart-total"></div>
       </body>
     </html>`,
    { url: 'https://example.com/' }
  );
  global.window = dom.window;
  global.document = dom.window.document;
  global.navigator = dom.window.navigator;
  global.localStorage = dom.window.localStorage;
  global.CustomEvent = dom.window.CustomEvent;
  global.IntersectionObserver = class {
    observe() {}
    disconnect() {}
    unobserve() {}
  };
  global.window.open = () => {};
  return dom;
}

test('initApp runs only once to avoid duplicate listeners', async () => {
  setupDom();

  let fetchCalls = 0;
  global.fetch = async () => {
    fetchCalls += 1;
    return {
      ok: true,
      json: async () => ({ products: [], version: 'v1' }),
      headers: new Headers({ 'content-type': 'application/json' }),
    };
  };

  const { initApp } = await import('../src/js/script.mjs');

  await initApp();
  await initApp();

  assert.strictEqual(fetchCalls, 1);
});
