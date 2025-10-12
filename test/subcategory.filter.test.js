const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { pathToFileURL } = require('url');

const productData = require('../data/product_data.json');
const slugifyModuleUrl = pathToFileURL(path.join(__dirname, '..', 'src/js/utils/slugify.mjs')).href;

async function loadSlugify() {
  const module = await import(slugifyModuleUrl);
  return module.slugify;
}

test('subcategory slugs resolve to existing products', async () => {
  const slugify = await loadSlugify();
  const targetSlugs = ['snackssalados', 'chocolates', 'energeticaseisotonicas'];

  targetSlugs.forEach(slug => {
    const matched = productData.products.filter(product => slugify(product.category) === slug);
    assert.ok(matched.length > 0, `Expected products for slug ${slug}`);
    assert.ok(matched.some(product => product.stock), `Expected in-stock products for slug ${slug}`);
  });
});
