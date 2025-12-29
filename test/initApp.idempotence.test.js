const test = require('node:test');
const assert = require('node:assert');
const { setupAppDom, teardownAppDom } = require('./helpers/dom-test-utils');

test('initApp runs only once to avoid duplicate listeners', async () => {
  setupAppDom(
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
  global.window.open = () => {};

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

  delete global.fetch;
  teardownAppDom();
});
