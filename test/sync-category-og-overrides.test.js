'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadModule() {
  const moduleUrl = `${
    pathToFileURL(path.join(process.cwd(), 'tools', 'sync-category-og-overrides.mjs')).href
  }?t=${Date.now()}`;
  return import(moduleUrl);
}

test('runSyncCategoryOgOverrides maps imagenes assets onto category slugs and removes stale variants', async () => {
  const { runSyncCategoryOgOverrides } = await loadModule();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ebano-og-overrides-'));
  const repoRoot = path.join(tempRoot, 'repo');
  const sourceDir = path.join(repoRoot, 'imagenes');
  const targetDir = path.join(repoRoot, 'assets', 'images', 'og', 'categories');
  const dataDir = path.join(repoRoot, 'data');

  fs.mkdirSync(sourceDir, { recursive: true });
  fs.mkdirSync(targetDir, { recursive: true });
  fs.mkdirSync(dataDir, { recursive: true });

  fs.writeFileSync(
    path.join(dataDir, 'category_registry.json'),
    `${JSON.stringify(
      {
        categories: [
          {
            id: 'bebidas',
            key: 'Bebidas',
            slug: 'bebidas',
            display_name: { default: 'Bebidas' },
            active: true,
          },
          {
            id: 'chocolates',
            key: 'Chocolates',
            slug: 'chocolates',
            display_name: { default: 'Chocolates' },
            active: true,
          },
          {
            id: 'snacksdulces',
            key: 'SnacksDulces',
            slug: 'snacksdulces',
            display_name: { default: 'Snacks Dulces' },
            active: true,
          },
          {
            id: 'llaveros',
            key: 'Llaveros',
            slug: 'llaveros',
            display_name: { default: 'Llaveros' },
            active: true,
          },
        ],
      },
      null,
      2
    )}\n`
  );

  fs.writeFileSync(path.join(sourceDir, 'bebidas.png'), 'bebidas-image');
  fs.writeFileSync(path.join(sourceDir, 'chocolate.png'), 'chocolate-image');
  fs.writeFileSync(path.join(sourceDir, 'snacks-dulces.png'), 'snacks-image');
  fs.writeFileSync(path.join(sourceDir, 'sin-match.png'), 'unknown-image');
  fs.writeFileSync(path.join(targetDir, 'bebidas.override.webp'), 'stale-variant');

  const result = runSyncCategoryOgOverrides({ repoRoot });

  assert.equal(
    fs.readFileSync(path.join(targetDir, 'bebidas.override.png'), 'utf8'),
    'bebidas-image'
  );
  assert.equal(
    fs.readFileSync(path.join(targetDir, 'chocolates.override.png'), 'utf8'),
    'chocolate-image'
  );
  assert.equal(
    fs.readFileSync(path.join(targetDir, 'snacksdulces.override.png'), 'utf8'),
    'snacks-image'
  );
  assert.equal(fs.existsSync(path.join(targetDir, 'bebidas.override.webp')), false);
  assert.deepEqual(result.unmatchedSources, ['sin-match.png']);
  assert.deepEqual(result.missingActiveCategories, ['llaveros']);

  const bebidasSync = result.synced.find((entry) => entry.slug === 'bebidas');
  assert.ok(bebidasSync);
  assert.deepEqual(bebidasSync.removedVariants, ['bebidas.override.webp']);

  fs.rmSync(tempRoot, { recursive: true, force: true });
});
