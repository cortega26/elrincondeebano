const {
  categoryRegistryPath,
  loadCategoryRegistry,
  validateCategoryRegistry,
} = require('./utils/category-registry');
const {
  loadProductData,
  normalizeCategoryKey,
  validateProductDataContract,
} = require('./utils/product-contract');

function getKnownCategoryKeys(registry) {
  const categories = Array.isArray(registry?.categories) ? registry.categories : [];
  return new Set(categories.map((category) => normalizeCategoryKey(category?.key)).filter(Boolean));
}

function validateProductCategoryReferences(registry, products) {
  const errors = [];
  const knownKeys = getKnownCategoryKeys(registry);

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
  const knownCategoryKeys = getKnownCategoryKeys(registry);

  const productData = loadProductData();
  const products = Array.isArray(productData?.products) ? productData.products : [];
  const productContractValidation = validateProductDataContract(productData, { knownCategoryKeys });
  const productValidationErrors = validateProductCategoryReferences(registry, products);

  const allErrors = [
    ...contractValidation.errors,
    ...productContractValidation.errors,
    ...productValidationErrors,
  ];

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
  getKnownCategoryKeys,
  validateProductCategoryReferences,
};
