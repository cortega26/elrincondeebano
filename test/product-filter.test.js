const test = require('node:test');
const assert = require('node:assert');

(async () => {
  const { filterProducts, sortProducts, isSimpleTypo, simpleTypoFix } = await import(
    '../src/js/modules/product-filter.mjs'
  );

  const products = [
    {
      id: 'a',
      name: 'Chocolate',
      description: 'Dulce',
      price: 1000,
      discount: 200,
      stock: true,
      originalIndex: 2,
    },
    {
      id: 'b',
      name: 'Galletas',
      description: 'Dulce y crujiente',
      price: 700,
      discount: 0,
      stock: true,
      originalIndex: 1,
    },
    {
      id: 'c',
      name: 'Soda',
      description: 'Bebida',
      price: 900,
      discount: 0,
      stock: false,
      originalIndex: 0,
    },
  ];

  test('filterProducts respects stock and discount filters', () => {
    const result = filterProducts(products, '', 'original', false);
    assert.deepStrictEqual(
      result.map((p) => p.id),
      ['b', 'a'],
      'in-stock products should remain in original order'
    );

    const discountedOnly = filterProducts(products, '', 'original', true);
    assert.deepStrictEqual(discountedOnly.map((p) => p.id), ['a']);
  });

  test('filterProducts matches exact keyword and simple typos', () => {
    const exact = filterProducts(products, 'dulce', 'name-asc', false);
    assert.deepStrictEqual(
      exact.map((p) => p.id),
      ['a', 'b'],
      'exact matches should include name and description'
    );

    const typo = filterProducts(products, 'choclate', 'original', false);
    assert.deepStrictEqual(
      typo.map((p) => p.id),
      ['a'],
      'simple typo should match product name'
    );
  });

  test('sortProducts handles price and name ordering', () => {
    const byPriceAsc = [...products].sort((a, b) => sortProducts(a, b, 'price-asc'));
    assert.strictEqual(byPriceAsc[0].id, 'b');

    const byPriceDesc = [...products].sort((a, b) => sortProducts(a, b, 'price-desc'));
    assert.strictEqual(byPriceDesc[0].id, 'c');

    const byNameDesc = [...products].sort((a, b) => sortProducts(a, b, 'name-desc'));
    assert.strictEqual(byNameDesc[0].id, 'c');
  });

  test('simpleTypoFix is conservative for short queries', () => {
    assert.strictEqual(simpleTypoFix('bo', 'Bombones'), false);
    assert.strictEqual(simpleTypoFix('', 'Chocolate'), false);
  });

  test('isSimpleTypo detects single-character differences', () => {
    assert.strictEqual(isSimpleTypo('choclate', 'chocolate'), true);
    assert.strictEqual(isSimpleTypo('chocolate', 'chocolate'), false);
  });
})();
