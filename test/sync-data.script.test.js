'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadSyncModule() {
  const moduleUrl = `${
    pathToFileURL(path.join(process.cwd(), 'astro-poc', 'scripts', 'sync-data.mjs')).href
  }?t=${Date.now()}`;
  return import(moduleUrl);
}

test('validateCatalogImageAssetPath accepts only assets/images paths', async () => {
  const { validateCatalogImageAssetPath } = await loadSyncModule();

  assert.doesNotThrow(() =>
    validateCatalogImageAssetPath('assets/images/demo/producto.webp', {
      fieldName: 'image_path',
      index: 0,
    })
  );

  assert.throws(
    () =>
      validateCatalogImageAssetPath('assets/demo/producto.webp', {
        fieldName: 'image_path',
        index: 0,
      }),
    /assets\/images\//
  );

  assert.throws(
    () =>
      validateCatalogImageAssetPath('https://cdn.example.com/producto.webp', {
        fieldName: 'image_path',
        index: 0,
      }),
    /external URLs are not allowed/
  );
});

test('runSync copies offline fallback into Astro public/pages, reduces public metadata, and validates product assets', async () => {
  const { runSync, createSyncPaths } = await loadSyncModule();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ebano-sync-'));
  const repoRoot = path.join(tempRoot, 'repo');
  const projectRoot = path.join(repoRoot, 'astro-poc');

  fs.mkdirSync(path.join(repoRoot, 'data'), { recursive: true });
  fs.mkdirSync(path.join(repoRoot, 'assets', 'images', 'demo'), { recursive: true });
  fs.mkdirSync(path.join(repoRoot, 'static'), { recursive: true });
  fs.mkdirSync(path.join(projectRoot, 'src', 'data'), { recursive: true });
  fs.mkdirSync(path.join(projectRoot, 'public'), { recursive: true });

  const productPayload = {
    version: 'v1',
    last_updated: '2026-03-11T00:00:00.000Z',
    rev: 0,
    products: [
      {
        name: 'Producto demo',
        description: 'Demo',
        price: 1000,
        discount: 0,
        stock: true,
        category: 'demo',
        image_path: 'assets/images/demo/producto.webp',
        image_avif_path: 'assets/images/demo/producto.avif',
        order: 0,
        is_archived: false,
        rev: 0,
      },
    ],
  };

  const categoryPayload = {
    schema_version: '1.0',
    version: 'v1',
    last_updated: '2026-03-11T00:00:00.000Z',
    nav_groups: [
      {
        id: 'grupo-demo',
        display_name: { default: 'Grupo Demo' },
        active: true,
        sort_order: 0,
      },
    ],
    categories: [
      {
        id: 'demo',
        key: 'demo',
        slug: 'demo',
        display_name: { default: 'Demo' },
        nav_group: 'grupo-demo',
        active: true,
        sort_order: 0,
      },
    ],
  };

  fs.writeFileSync(
    path.join(repoRoot, 'data', 'product_data.json'),
    `${JSON.stringify(productPayload, null, 2)}\n`
  );
  fs.writeFileSync(
    path.join(repoRoot, 'data', 'category_registry.json'),
    `${JSON.stringify(categoryPayload, null, 2)}\n`
  );
  fs.writeFileSync(path.join(repoRoot, 'assets', 'images', 'demo', 'producto.webp'), 'webp');
  fs.writeFileSync(path.join(repoRoot, 'assets', 'images', 'demo', 'producto.avif'), 'avif');
  fs.writeFileSync(path.join(repoRoot, 'robots.txt'), 'User-agent: *\nAllow: /\n');
  fs.writeFileSync(path.join(repoRoot, 'app.webmanifest'), '{"name":"demo"}\n');
  fs.writeFileSync(
    path.join(repoRoot, 'service-worker.js'),
    'self.addEventListener("install",()=>{});\n'
  );
  fs.writeFileSync(
    path.join(repoRoot, 'static', 'offline.html'),
    '<!doctype html><title>offline</title>\n'
  );

  runSync({ projectRoot, repoRoot });

  const paths = createSyncPaths({ projectRoot, repoRoot });
  assert.equal(
    fs.readFileSync(paths.targetOfflinePath, 'utf8'),
    fs.readFileSync(paths.sourceOfflinePath, 'utf8')
  );
  assert.ok(fs.existsSync(paths.targetServiceWorkerPath));
  assert.ok(fs.existsSync(paths.targetPublicProductDataPath));
  const internalProductsPayload = JSON.parse(fs.readFileSync(paths.targetProductsPath, 'utf8'));
  const publicProductsPayload = JSON.parse(fs.readFileSync(paths.targetPublicProductDataPath, 'utf8'));
  assert.equal(internalProductsPayload.rev, 0);
  assert.equal(internalProductsPayload.products[0].rev, 0);
  assert.deepEqual(publicProductsPayload.rev, undefined);
  assert.deepEqual(publicProductsPayload.products[0].rev, undefined);
  assert.deepEqual(publicProductsPayload.products[0].field_last_modified, undefined);

  const invalidPayload = {
    ...productPayload,
    products: [
      {
        ...productPayload.products[0],
        image_path: 'assets/demo/producto.webp',
      },
    ],
  };
  fs.writeFileSync(
    path.join(repoRoot, 'data', 'product_data.json'),
    `${JSON.stringify(invalidPayload, null, 2)}\n`
  );

  assert.throws(() => runSync({ projectRoot, repoRoot }), /assets\/images\//);

  fs.rmSync(tempRoot, { recursive: true, force: true });
});
