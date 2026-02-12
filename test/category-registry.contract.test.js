const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  legacyCatalogPath,
  loadCategoryRegistry,
  loadLegacyCategoryCatalog,
  convertRegistryToLegacyCatalog,
  validateCategoryRegistry,
} = require('../tools/utils/category-registry');
const { validateProductCategoryReferences } = require('../tools/validate-category-registry.js');
const { buildNavModel, buildCategoryPages } = require('../tools/utils/category-catalog.js');

function normalizeLegacyCatalogSnapshot(catalog) {
  return {
    nav_groups: (catalog.nav_groups || [])
      .map((group) => ({
        id: group.id,
        label: group.label,
        order: group.order || 0,
        description: group.description || '',
        enabled: group.enabled !== false,
      }))
      .sort((a, b) => String(a.id).localeCompare(String(b.id))),
    categories: (catalog.categories || [])
      .map((category) => ({
        id: category.id,
        title: category.title,
        product_key: category.product_key,
        slug: category.slug,
        group_id: category.group_id,
        order: category.order || 0,
        enabled: category.enabled !== false,
      }))
      .sort((a, b) => String(a.id).localeCompare(String(b.id))),
  };
}

test('category registry contract validates uniqueness and required fields', () => {
  const registry = loadCategoryRegistry({ preferRegistry: true });
  const result = validateCategoryRegistry(registry);
  assert.equal(result.isValid, true, result.errors.join('\n'));
  assert.equal((registry.categories || []).length > 0, true, 'registry should include categories');
});

test('product catalog references existing category keys', () => {
  const repoRoot = path.resolve(__dirname, '..');
  const productDataPath = path.join(repoRoot, 'data', 'product_data.json');
  const raw = fs.readFileSync(productDataPath, 'utf8');
  const parsed = JSON.parse(raw);
  const products = Array.isArray(parsed?.products) ? parsed.products : [];
  const registry = loadCategoryRegistry({ preferRegistry: true });
  const errors = validateProductCategoryReferences(registry, products);
  assert.deepEqual(errors, []);
});

test('registry compat layer preserves legacy catalog shape and storefront outputs', () => {
  const legacyCatalog = loadLegacyCategoryCatalog();
  const registry = loadCategoryRegistry({ preferRegistry: true });
  const backToLegacy = convertRegistryToLegacyCatalog(registry, {
    version: legacyCatalog.version,
    last_updated: legacyCatalog.last_updated,
  });

  const normalizedLegacy = normalizeLegacyCatalogSnapshot(legacyCatalog);
  const normalizedFromRegistry = normalizeLegacyCatalogSnapshot(backToLegacy);

  assert.deepEqual(
    normalizedFromRegistry,
    normalizedLegacy,
    `Registry file must remain 1:1 compatible with ${legacyCatalogPath}`
  );

  const legacyNav = buildNavModel(legacyCatalog);
  const registryNav = buildNavModel(backToLegacy);
  assert.deepEqual(registryNav, legacyNav);

  const legacyPages = buildCategoryPages(legacyCatalog);
  const registryPages = buildCategoryPages(backToLegacy);
  assert.deepEqual(registryPages, legacyPages);
});
