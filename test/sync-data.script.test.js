'use strict';

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

function writeFixturePayload(filePath, payload) {
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function createSyncFixture() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ebano-sync-'));
  const repoRoot = path.join(tempRoot, 'repo');
  const projectRoot = path.join(repoRoot, 'astro-poc');

  fs.mkdirSync(path.join(repoRoot, 'data'), { recursive: true });
  fs.mkdirSync(path.join(repoRoot, 'assets', 'images', 'demo'), { recursive: true });
  fs.mkdirSync(path.join(repoRoot, 'assets', 'images', 'og', 'categories'), { recursive: true });
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

  writeFixturePayload(path.join(repoRoot, 'data', 'product_data.json'), productPayload);
  writeFixturePayload(path.join(repoRoot, 'data', 'category_registry.json'), categoryPayload);
  fs.writeFileSync(path.join(repoRoot, 'assets', 'images', 'demo', 'producto.webp'), 'webp');
  fs.writeFileSync(path.join(repoRoot, 'assets', 'images', 'demo', 'producto.avif'), 'avif');
  fs.writeFileSync(path.join(repoRoot, 'assets', 'images', 'og', 'logo.png'), 'source-logo');
  fs.writeFileSync(
    path.join(repoRoot, 'assets', 'images', 'og', 'categories', 'demo.override.png'),
    'source-override'
  );
  fs.writeFileSync(
    path.join(repoRoot, 'assets', 'images', 'og', 'categories', 'demo.og_v3.jpg'),
    'generated-og'
  );
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

  return { tempRoot, repoRoot, projectRoot, productPayload };
}

function captureSyncLog(callback) {
  const lines = [];
  const originalLog = console.log;
  console.log = (...args) => lines.push(args.join(' '));
  try {
    callback();
  } finally {
    console.log = originalLog;
  }
  return lines.join('\n');
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
  const { tempRoot, repoRoot, projectRoot, productPayload } = createSyncFixture();

  runSync({ projectRoot, repoRoot });

  const paths = createSyncPaths({ projectRoot, repoRoot });
  assert.equal(
    fs.readFileSync(paths.targetOfflinePath, 'utf8'),
    fs.readFileSync(paths.sourceOfflinePath, 'utf8')
  );
  assert.ok(fs.existsSync(paths.targetServiceWorkerPath));
  assert.ok(fs.existsSync(paths.targetPublicProductDataPath));
  const internalProductsPayload = JSON.parse(fs.readFileSync(paths.targetProductsPath, 'utf8'));
  const publicProductsPayload = JSON.parse(
    fs.readFileSync(paths.targetPublicProductDataPath, 'utf8')
  );
  assert.equal(internalProductsPayload.rev, 0);
  assert.equal(internalProductsPayload.products[0].rev, 0);
  assert.deepEqual(publicProductsPayload.rev, undefined);
  assert.deepEqual(publicProductsPayload.products[0].rev, undefined);
  assert.deepEqual(publicProductsPayload.products[0].field_last_modified, undefined);
  assert.ok(
    fs.existsSync(path.join(projectRoot, 'public', 'assets', 'images', 'demo', 'producto.webp'))
  );
  assert.ok(
    fs.existsSync(
      path.join(projectRoot, 'public', 'assets', 'images', 'og', 'categories', 'demo.og_v3.jpg')
    )
  );
  assert.equal(
    fs.existsSync(path.join(projectRoot, 'public', 'assets', 'images', 'og', 'logo.png')),
    false
  );
  assert.equal(
    fs.existsSync(
      path.join(projectRoot, 'public', 'assets', 'images', 'og', 'categories', 'demo.override.png')
    ),
    false
  );

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

test('runSync mirrors public assets incrementally (copy-new, skip-unchanged, remove-extra, filter both directions)', async () => {
  const { runSync, createSyncPaths } = await loadSyncModule();
  const { tempRoot, repoRoot, projectRoot } = createSyncFixture();
  const paths = createSyncPaths({ projectRoot, repoRoot });
  const sourceAssets = paths.sourceAssetsPath;
  const targetAssets = paths.targetPublicAssetsPath;
  const targetProductoWebp = path.join(targetAssets, 'images', 'demo', 'producto.webp');

  try {
    // copy-new: kept source files land in the target; excluded ones never do
    const firstRun = captureSyncLog(() => runSync({ projectRoot, repoRoot }));
    assert.match(firstRun, /3 copied, 0 removed/);
    assert.equal(fs.readFileSync(targetProductoWebp, 'utf8'), 'webp');
    assert.equal(
      fs.readFileSync(
        path.join(targetAssets, 'images', 'og', 'categories', 'demo.og_v3.jpg'),
        'utf8'
      ),
      'generated-og'
    );
    assert.equal(fs.existsSync(path.join(targetAssets, 'images', 'og', 'logo.png')), false);
    assert.equal(
      fs.existsSync(path.join(targetAssets, 'images', 'og', 'categories', 'demo.override.png')),
      false
    );

    // skip-unchanged: a second identical run copies and removes nothing
    const secondRun = captureSyncLog(() => runSync({ projectRoot, repoRoot }));
    assert.match(secondRun, /0 copied, 0 removed/);

    // remove-extra: stale file, stale directory, and a lingering excluded path
    fs.writeFileSync(path.join(targetAssets, 'images', 'stale.webp'), 'stale');
    fs.mkdirSync(path.join(targetAssets, 'images', 'stale-dir'), { recursive: true });
    fs.writeFileSync(path.join(targetAssets, 'images', 'stale-dir', 'inner.webp'), 'stale');
    fs.writeFileSync(path.join(targetAssets, 'images', 'og', 'logo.png'), 'lingering-excluded');
    const thirdRun = captureSyncLog(() => runSync({ projectRoot, repoRoot }));
    assert.match(thirdRun, /0 copied, 3 removed/);
    assert.equal(fs.existsSync(path.join(targetAssets, 'images', 'stale.webp')), false);
    assert.equal(fs.existsSync(path.join(targetAssets, 'images', 'stale-dir')), false);
    assert.equal(fs.existsSync(path.join(targetAssets, 'images', 'og', 'logo.png')), false);

    // changed source content recopies exactly that file
    fs.writeFileSync(path.join(sourceAssets, 'images', 'demo', 'producto.webp'), 'webp-v2');
    const fourthRun = captureSyncLog(() => runSync({ projectRoot, repoRoot }));
    assert.match(fourthRun, /1 copied, 0 removed/);
    assert.equal(fs.readFileSync(targetProductoWebp, 'utf8'), 'webp-v2');

    // deleted source file is pruned from the mirror
    fs.rmSync(path.join(sourceAssets, 'images', 'demo', 'producto.avif'));
    const fifthRun = captureSyncLog(() => runSync({ projectRoot, repoRoot }));
    assert.match(fifthRun, /0 copied, 1 removed/);
    assert.equal(fs.existsSync(path.join(targetAssets, 'images', 'demo', 'producto.avif')), false);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
