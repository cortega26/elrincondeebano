import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { productSchema } from '../admin/content-manager/src/shared/schemas/product.ts';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { validateProduct } = require('../tools/utils/product-contract.js');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturePath = path.resolve(
  __dirname,
  '..',
  'plans',
  'fixtures',
  '055',
  'product_catalog.json'
);
const categoryPath = path.resolve(
  __dirname,
  '..',
  'plans',
  'fixtures',
  '055',
  'category_registry.json'
);

test('parity root: admin zod and tools validator agree on fixture corpus (plan 154)', () => {
  const data = JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));
  const catData = JSON.parse(fs.readFileSync(categoryPath, 'utf-8'));
  const knownKeys = new Set(
    catData.categories.map((c) => String(c.key).trim().toLowerCase()).filter(Boolean)
  );

  for (const product of data.products) {
    const zodRes = productSchema.safeParse(product);
    const toolsErrors = validateProduct(product, 0, { knownCategoryKeys: knownKeys });
    const toolsValid = toolsErrors.length === 0;
    // Exact agreement for fixture corpus (both reject raster missing AVIF, both accept others)
    assert.equal(
      zodRes.success,
      toolsValid,
      `Mismatch for ${product.name}: zod ${zodRes.success} vs tools ${toolsValid} errors ${toolsErrors.join('; ')}`
    );
  }
});

test('parity root: synthetic corpus agreement', () => {
  const knownKeys = new Set(['abarrotes']);
  const cases = [
    {
      name: 'valid',
      product: {
        name: 'Valid',
        description: 'ok',
        price: 1000,
        discount: 0,
        stock: true,
        category: 'abarrotes',
        image_path: 'assets/images/abarrotes/valid.webp',
        image_avif_path: 'assets/images/abarrotes/valid.avif',
        order: 0,
        is_archived: false,
        rev: 0,
        field_last_modified: {},
      },
      valid: true,
    },
    {
      name: 'raster missing avif',
      product: {
        name: 'Raster missing AVIF',
        description: 'ok',
        price: 1000,
        discount: 0,
        stock: true,
        category: 'abarrotes',
        image_path: 'assets/images/abarrotes/raster.webp',
        image_avif_path: '',
        order: 0,
        is_archived: false,
        rev: 0,
        field_last_modified: {},
      },
      valid: false,
    },
  ];

  for (const { product, valid, name } of cases) {
    const zodRes = productSchema.safeParse(product);
    const toolsErrors = validateProduct(product, 0, { knownCategoryKeys: knownKeys });
    const toolsValid = toolsErrors.length === 0;
    assert.equal(zodRes.success, valid, `${name} zod`);
    assert.equal(toolsValid, valid, `${name} tools`);
    if (!toolsValid) assert.equal(zodRes.success, false, `${name} superset`);
  }
});
