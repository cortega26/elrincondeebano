// Plan 055 — Phase 0.3: Validate synthetic fixtures against Astro Zod schemas.
// Produces golden validation evidence in plans/fixtures/055/golden/astro_validation.json
//
// Usage: node plans/fixtures/055/capture_astro_golden.mjs

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureDir = path.resolve(__dirname);
const goldenDir = path.join(fixtureDir, 'golden');

function loadJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

/* eslint-disable max-lines-per-function, complexity, sonarjs/cognitive-complexity */
async function validate() {
  mkdirSync(goldenDir, { recursive: true });

  const {
    productCatalogSchema,
    categoryRegistrySchema,
    storefrontExperienceSchema,
    productSchema,
  } = await import('../../../astro-poc/src/lib/data-schemas.ts');

  const evidence = {
    generated_at: new Date().toISOString(),
    schemas: {
      product: 'productSchema',
      catalog: 'productCatalogSchema',
      categoryRegistry: 'categoryRegistrySchema',
      storefront: 'storefrontExperienceSchema',
    },
    results: {},
    summary: { passed: 0, failed: 0, warnings: 0 },
  };

  // --- Product catalog validation ---
  try {
    const products = loadJson(path.join(fixtureDir, 'product_catalog.json'));
    const result = productCatalogSchema.safeParse(products);
    evidence.results.product_catalog = {
      status: result.success ? 'pass' : 'fail',
      product_count: products.products?.length ?? 0,
      issues: result.success
        ? []
        : result.error.issues.map((i) => ({
            path: i.path.join(' > '),
            message: i.message,
            code: i.code,
          })),
    };

    // Per-product validation
    const perProduct = [];
    for (let i = 0; i < (products.products ?? []).length; i++) {
      const product = products.products[i];
      const pr = productSchema.safeParse(product);
      perProduct.push({
        index: i,
        name: product.name ?? '?',
        valid: pr.success,
        issues: pr.success
          ? []
          : pr.error.issues.map((i) => ({
              path: i.path.join(' > '),
              message: i.message,
            })),
      });
    }
    evidence.results.product_catalog.per_product = perProduct;

    if (result.success) {
      evidence.summary.passed += 1;
    } else {
      evidence.summary.failed += 1;
    }
  } catch (err) {
    evidence.results.product_catalog = {
      status: 'error',
      error: err.message,
    };
    evidence.summary.failed += 1;
  }

  // --- Category registry validation ---
  try {
    const categories = loadJson(path.join(fixtureDir, 'category_registry.json'));
    const result = categoryRegistrySchema.safeParse(categories);
    evidence.results.category_registry = {
      status: result.success ? 'pass' : 'fail',
      nav_groups_count: categories.nav_groups?.length ?? 0,
      category_count: categories.categories?.length ?? 0,
      issues: result.success
        ? []
        : result.error.issues.map((i) => ({
            path: i.path.join(' > '),
            message: i.message,
            code: i.code,
          })),
    };
    if (result.success) {
      evidence.summary.passed += 1;
    } else {
      evidence.summary.failed += 1;
    }
  } catch (err) {
    evidence.results.category_registry = {
      status: 'error',
      error: err.message,
    };
    evidence.summary.failed += 1;
  }

  // --- Storefront experience validation ---
  try {
    const experience = loadJson(path.join(fixtureDir, 'storefront_experience.json'));
    const result = storefrontExperienceSchema.safeParse(experience);
    evidence.results.storefront_experience = {
      status: result.success ? 'pass' : 'fail',
      bundle_count: experience.bundles?.length ?? 0,
      issues: result.success
        ? []
        : result.error.issues.map((i) => ({
            path: i.path.join(' > '),
            message: i.message,
            code: i.code,
          })),
    };
    if (result.success) {
      evidence.summary.passed += 1;
    } else {
      evidence.summary.failed += 1;
    }
  } catch (err) {
    evidence.results.storefront_experience = {
      status: 'error',
      error: err.message,
    };
    evidence.summary.failed += 1;
  }

  const outPath = path.join(goldenDir, 'astro_validation.json');
  writeFileSync(outPath, JSON.stringify(evidence, null, 2), 'utf8');

  console.log('=== Astro Zod Validation Results ===');
  const productCat = evidence.results.product_catalog;
  console.log(`Product Catalog: ${productCat.status} (${productCat.product_count ?? 0} products)`);
  if (productCat.issues?.length) {
    productCat.issues.forEach((i) => console.log(`  - ${i.path}: ${i.message}`));
  }
  if (productCat.per_product) {
    for (const pp of productCat.per_product) {
      if (!pp.valid) {
        console.log(`  [${pp.index}] ${pp.name}: FAIL`);
        pp.issues.forEach((i) => console.log(`    - ${i.path}: ${i.message}`));
      }
    }
  }

  const catReg = evidence.results.category_registry;
  console.log(
    `Category Registry: ${catReg.status} (${catReg.nav_groups_count ?? 0} groups, ${catReg.category_count ?? 0} categories)`
  );
  if (catReg.issues?.length) {
    catReg.issues.forEach((i) => console.log(`  - ${i.path}: ${i.message}`));
  }

  const sfExp = evidence.results.storefront_experience;
  console.log(`Storefront Experience: ${sfExp.status} (${sfExp.bundle_count ?? 0} bundles)`);
  if (sfExp.issues?.length) {
    sfExp.issues.forEach((i) => console.log(`  - ${i.path}: ${i.message}`));
  }

  console.log(
    `\nSummary: ${evidence.summary.passed} passed, ${evidence.summary.failed} failed, ${evidence.summary.warnings} warnings`
  );
  console.log(`Written: ${outPath}`);

  process.exit(evidence.summary.failed > 0 ? 1 : 0);
}

validate().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
