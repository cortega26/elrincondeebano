const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sharp = require('sharp');

const {
  deriveAvifPath,
  supportsAvifConversion,
  syncProductCatalogAvif,
} = require('../tools/sync-avif-assets.js');

test('deriveAvifPath swaps raster extensions for avif', () => {
  assert.equal(deriveAvifPath('assets/images/demo/item.webp'), 'assets/images/demo/item.avif');
  assert.equal(deriveAvifPath('/assets/images/demo/item.png'), 'assets/images/demo/item.avif');
  assert.equal(deriveAvifPath('assets/images/demo/item.avif'), 'assets/images/demo/item.avif');
});

test('supportsAvifConversion accepts raster catalog assets', () => {
  assert.equal(supportsAvifConversion('assets/images/demo/item.webp'), true);
  assert.equal(supportsAvifConversion('assets/images/demo/item.jpg'), true);
  assert.equal(supportsAvifConversion('assets/images/demo/item.svg'), false);
});

test('syncProductCatalogAvif generates missing AVIF assets and updates catalog links', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ebano-avif-sync-'));
  const sourceImagePath = path.join(repoRoot, 'assets', 'images', 'demo', 'producto.png');
  const productsJsonPath = path.join(repoRoot, 'data', 'product_data.json');

  fs.mkdirSync(path.dirname(sourceImagePath), { recursive: true });
  fs.mkdirSync(path.dirname(productsJsonPath), { recursive: true });

  await sharp({
    create: {
      width: 8,
      height: 8,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .png()
    .toFile(sourceImagePath);

  fs.writeFileSync(
    productsJsonPath,
    JSON.stringify(
      {
        version: 'v1',
        last_updated: '2026-03-10T00:00:00.000Z',
        rev: 0,
        products: [
          {
            name: 'Producto demo',
            description: 'Demo',
            price: 1000,
            discount: 0,
            stock: true,
            category: 'Demo',
            image_path: 'assets/images/demo/producto.png',
            image_avif_path: '',
            order: 0,
            is_archived: false,
            rev: 0,
          },
        ],
      },
      null,
      2
    )
  );

  const stats = await syncProductCatalogAvif({ productsJsonPath, repoRoot });
  const nextPayload = JSON.parse(fs.readFileSync(productsJsonPath, 'utf8'));
  const avifPath = path.join(repoRoot, 'assets', 'images', 'demo', 'producto.avif');

  assert.equal(stats.updatedProducts, 1);
  assert.equal(nextPayload.products[0].image_avif_path, 'assets/images/demo/producto.avif');
  assert.equal(fs.existsSync(avifPath), true);

  fs.rmSync(repoRoot, { recursive: true, force: true });
});
