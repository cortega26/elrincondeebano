const fs = require('fs');
const path = require('path');

const { rootDir } = require('./utils/output-dir');
const {
  categoryRegistryPath,
  loadCategoryRegistry,
  validateCategoryRegistry,
} = require('./utils/category-registry');

const productDataPath = path.join(rootDir, 'data', 'product_data.json');

function loadProductData() {
  const raw = fs.readFileSync(productDataPath, 'utf8');
  const parsed = JSON.parse(raw);
  const products = Array.isArray(parsed?.products) ? parsed.products : [];
  return products;
}

function validateProductCategoryReferences(registry, products) {
  const errors = [];
  const categories = Array.isArray(registry?.categories) ? registry.categories : [];
  const knownKeys = new Set(
    categories
      .map((category) => String(category?.key || '').trim().toLowerCase())
      .filter(Boolean)
  );

  products.forEach((product, index) => {
    const rawCategory = String(product?.category || '').trim();
    if (!rawCategory) {
      errors.push(`products[${index}] "${product?.name || 'unknown'}" is missing category`);
      return;
    }
    if (!knownKeys.has(rawCategory.toLowerCase())) {
      errors.push(
        `products[${index}] "${product?.name || 'unknown'}" references unknown category key "${rawCategory}"`
      );
    }
  });

  return errors;
}

function main() {
  const registry = loadCategoryRegistry({ preferRegistry: true });
  const contractValidation = validateCategoryRegistry(registry);

  const products = loadProductData();
  const productValidationErrors = validateProductCategoryReferences(registry, products);

  const allErrors = [...contractValidation.errors, ...productValidationErrors];

  if (allErrors.length) {
    console.error(`Category registry validation failed (${allErrors.length} issues):`);
    allErrors.forEach((error) => console.error(`- ${error}`));
    process.exit(1);
  }

  console.log(`Category registry OK (${categoryRegistryPath})`);
  console.log(`Validated categories: ${registry.categories?.length || 0}`);
  console.log(`Validated products: ${products.length}`);
}

if (require.main === module) {
  main();
}

module.exports = {
  validateProductCategoryReferences,
};
