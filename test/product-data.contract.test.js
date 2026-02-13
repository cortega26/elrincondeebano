const test = require('node:test');
const assert = require('node:assert/strict');

const { loadCategoryRegistry } = require('../tools/utils/category-registry');
const { loadProductData, validateProductDataContract } = require('../tools/utils/product-contract');
const { getKnownCategoryKeys } = require('../tools/validate-category-registry');

test('product_data.json satisfies product contract', () => {
  const registry = loadCategoryRegistry({ preferRegistry: true });
  const knownCategoryKeys = getKnownCategoryKeys(registry);
  const productData = loadProductData();

  const result = validateProductDataContract(productData, { knownCategoryKeys });

  assert.equal(result.isValid, true, result.errors.join('\n'));
});

test('product contract rejects malformed top-level payload', () => {
  const result = validateProductDataContract({
    version: '',
    last_updated: 'not-a-date',
    rev: -1,
    products: {},
  });

  assert.equal(result.isValid, false);
  assert.equal(
    result.errors.some((error) => error.includes('product_data.version')),
    true
  );
  assert.equal(
    result.errors.some((error) => error.includes('product_data.last_updated')),
    true
  );
  assert.equal(result.errors.some((error) => error.includes('product_data.rev')), true);
  assert.equal(result.errors.some((error) => error.includes('product_data.products')), true);
});

test('product contract rejects invalid product fields and unknown categories', () => {
  const payload = {
    version: 'v1',
    last_updated: '2026-02-13T00:00:00.000Z',
    rev: 0,
    products: [
      {
        name: 'Producto inválido',
        description: 123,
        price: 1000,
        discount: 1200,
        stock: 'yes',
        category: 'inexistente',
        image_path: '../assets/image.jpg',
        image_avif_path: 777,
        order: -1,
        is_archived: 'false',
        rev: 1.5,
        field_last_modified: {
          stock: {
            ts: 'invalid-ts',
            by: '',
            rev: -2,
            base_rev: 'zero',
            changeset_id: '',
          },
        },
      },
    ],
  };

  const knownCategoryKeys = new Set(['abarrotes']);
  const result = validateProductDataContract(payload, { knownCategoryKeys });

  assert.equal(result.isValid, false);
  assert.equal(result.errors.some((error) => error.includes('unknown category')), true);
  assert.equal(result.errors.some((error) => error.includes('discount cannot exceed price')), true);
  assert.equal(result.errors.some((error) => error.includes('stock must be a boolean')), true);
  assert.equal(
    result.errors.some((error) => error.includes('image_path must be a safe local path')),
    true
  );
  assert.equal(
    result.errors.some((error) => error.includes('field_last_modified.stock.ts must be an ISO date string')),
    true
  );
});
