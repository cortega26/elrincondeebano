const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { resolveProductsJsonPath } = require('../tools/generate-image-variants.js');

test('resolveProductsJsonPath defaults to repo data file', () => {
  const original = process.env.PRODUCTS_JSON;
  delete process.env.PRODUCTS_JSON;
  const repoRoot = path.resolve(__dirname, '..');
  const expected = path.join(repoRoot, 'data', 'product_data.json');
  assert.strictEqual(resolveProductsJsonPath(), expected);
  if (original !== undefined) {
    process.env.PRODUCTS_JSON = original;
  }
});

test('resolveProductsJsonPath honors PRODUCTS_JSON override', () => {
  const original = process.env.PRODUCTS_JSON;
  process.env.PRODUCTS_JSON = 'tmp/products.json';
  const expected = path.resolve('tmp/products.json');
  assert.strictEqual(resolveProductsJsonPath(), expected);
  if (original !== undefined) {
    process.env.PRODUCTS_JSON = original;
  } else {
    delete process.env.PRODUCTS_JSON;
  }
});
