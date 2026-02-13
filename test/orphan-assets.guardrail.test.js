'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { findOrphanAssets } = require('../tools/guardrails/orphan-assets.js');

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

function createFixtureRepo() {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ebano-orphan-assets-'));

  writeFile(
    path.join(repoRoot, 'data', 'product_data.json'),
    JSON.stringify(
      {
        products: [{ image_path: 'assets/images/chocolates/used.webp' }],
      },
      null,
      2
    )
  );
  writeFile(
    path.join(repoRoot, 'templates', 'index.ejs'),
    '<img src="/assets/images/web/logo.webp" alt="logo">'
  );

  writeFile(path.join(repoRoot, 'assets', 'images', 'chocolates', 'used.webp'), 'used');
  writeFile(path.join(repoRoot, 'assets', 'images', 'chocolates', 'orphan.webp'), 'orphan');
  writeFile(path.join(repoRoot, 'assets', 'images', 'web', 'logo.webp'), 'logo');
  writeFile(path.join(repoRoot, 'assets', 'images', 'originals', 'raw.webp'), 'raw');

  return repoRoot;
}

test('orphan-assets guard flags unexpected orphan files and ignores configured directories', () => {
  const repoRoot = createFixtureRepo();
  const allowlistPath = path.join(repoRoot, 'tools', 'guardrails', 'orphan-assets.allowlist.json');

  writeFile(
    allowlistPath,
    JSON.stringify(
      {
        ignoredDirectories: ['originals', 'variants'],
        allowedOrphans: [],
      },
      null,
      2
    )
  );

  const result = findOrphanAssets({ repoRoot, allowlistPath });

  assert.deepStrictEqual(result.unexpectedOrphans, ['assets/images/chocolates/orphan.webp']);
  assert.ok(!result.unexpectedOrphans.includes('assets/images/originals/raw.webp'));

  fs.rmSync(repoRoot, { recursive: true, force: true });
});

test('orphan-assets guard allows baseline entries and reports stale allowlist entries', () => {
  const repoRoot = createFixtureRepo();
  const allowlistPath = path.join(repoRoot, 'tools', 'guardrails', 'orphan-assets.allowlist.json');

  writeFile(
    allowlistPath,
    JSON.stringify(
      {
        ignoredDirectories: ['originals', 'variants'],
        allowedOrphans: ['assets/images/chocolates/orphan.webp'],
      },
      null,
      2
    )
  );

  const withBaseline = findOrphanAssets({ repoRoot, allowlistPath });
  assert.deepStrictEqual(withBaseline.unexpectedOrphans, []);
  assert.deepStrictEqual(withBaseline.orphanAssets, ['assets/images/chocolates/orphan.webp']);

  fs.unlinkSync(path.join(repoRoot, 'assets', 'images', 'chocolates', 'orphan.webp'));

  const afterCleanup = findOrphanAssets({ repoRoot, allowlistPath });
  assert.deepStrictEqual(afterCleanup.orphanAssets, []);
  assert.deepStrictEqual(afterCleanup.staleAllowedOrphans, ['assets/images/chocolates/orphan.webp']);

  fs.rmSync(repoRoot, { recursive: true, force: true });
});
