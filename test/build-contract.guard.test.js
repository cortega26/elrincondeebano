'use strict';

// Plan 075 regression guard: the five build-contract tests must keep
// fail-closed semantics. A future edit that flips them back to t.skip()
// (silently skipping the contract when astro-poc/dist is absent) fails this
// test — fix the file, never weaken this guard.
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const CONTRACT_FILES = [
  'test/csp.policy.hardening.test.js',
  'test/share-preview.build-contract.test.js',
  'test/category-og.build-metadata.test.js',
  'test/product-og.build-metadata.test.js',
  'test/home-og.build-metadata.test.js',
];

const ROOT = path.resolve(__dirname, '..');

test('build-contract tests fail closed (no t.skip, assert.fail present)', () => {
  for (const rel of CONTRACT_FILES) {
    const content = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    const skips = content.match(/t\.skip\(/g) ?? [];
    const guardedSkips = content.match(/CI_SKIP_BUILD_CONTRACT === '1'\)\s*\{\s*t\.skip\(/g) ?? [];
    assert.strictEqual(
      guardedSkips.length,
      skips.length,
      `${rel} has an unguarded t.skip() — must fail closed (plan 075)`
    );
    assert.ok(
      /assert\.fail\(/.test(content),
      `${rel} has no assert.fail() — the missing-dist path must fail loudly`
    );
    assert.ok(
      /CI_SKIP_BUILD_CONTRACT/.test(content),
      `${rel} lost the documented CI_SKIP_BUILD_CONTRACT opt-in`
    );
  }
});
