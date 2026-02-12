const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  injectIntoFile,
  resolveProductsForPage,
  parseInlineProductPayload,
} = require('../tools/inject-structured-data.js');

function makeTempFile(content) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'inject-structured-data-'));
  const filePath = path.join(tempDir, 'page.html');
  fs.writeFileSync(filePath, content, 'utf8');
  return filePath;
}

function readStructuredDataGraph(html) {
  const match = html.match(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i
  );
  assert.ok(match, 'Expected a JSON-LD script block');
  return JSON.parse(match[1]);
}

test('resolveProductsForPage prioritizes inline category payload', () => {
  const html = `<!doctype html><html><head></head><body>
  <script id="product-data" type="application/json">{"initialProducts":[{"name":"Inline A","price":1000,"stock":true}]}</script>
  </body></html>`;

  const products = resolveProductsForPage(html, [{ name: 'Fallback', price: 1, stock: true }]);
  assert.equal(products.length, 1);
  assert.equal(products[0].name, 'Inline A');

  const parsed = parseInlineProductPayload(html);
  assert.equal(parsed.hasPayload, true);
  assert.equal(parsed.products.length, 1);
});

test('injectIntoFile uses inline payload and does not leak fallback catalog', () => {
  const filePath = makeTempFile(`<!doctype html><html><head><title>Category</title></head><body>
    <script id="product-data" type="application/json">{"initialProducts":[{"name":"Solo Categoria","price":1590,"stock":true}]}</script>
  </body></html>`);

  const injected = injectIntoFile(filePath, [{ name: 'Global Product', price: 999, stock: true }]);
  assert.equal(injected, true);

  const html = fs.readFileSync(filePath, 'utf8');
  const graph = readStructuredDataGraph(html);
  const productNames = (graph['@graph'] || [])
    .filter((node) => node && node['@type'] === 'Product')
    .map((node) => node.name);
  assert.deepEqual(productNames, ['Solo Categoria']);
});

test('injectIntoFile respects empty inline payload as empty category', () => {
  const filePath = makeTempFile(`<!doctype html><html><head><title>Empty Category</title></head><body>
    <script id="product-data" type="application/json">{"initialProducts":[]}</script>
  </body></html>`);

  injectIntoFile(filePath, [{ name: 'Global Product', price: 999, stock: true }]);

  const html = fs.readFileSync(filePath, 'utf8');
  const graph = readStructuredDataGraph(html);
  const products = (graph['@graph'] || []).filter((node) => node && node['@type'] === 'Product');
  assert.equal(products.length, 0);
});

test('injectIntoFile falls back to global catalog when inline payload is absent', () => {
  const filePath = makeTempFile('<!doctype html><html><head><title>No Inline</title></head><body></body></html>');

  injectIntoFile(filePath, [{ name: 'Global Product', price: 999, stock: true }]);

  const html = fs.readFileSync(filePath, 'utf8');
  const graph = readStructuredDataGraph(html);
  const products = (graph['@graph'] || []).filter((node) => node && node['@type'] === 'Product');
  assert.equal(products.length, 1);
  assert.equal(products[0].name, 'Global Product');
});
