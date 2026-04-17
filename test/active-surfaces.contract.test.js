'use strict';

const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');

const manifest = JSON.parse(fs.readFileSync('docs/repo/ACTIVE_SURFACES.json', 'utf8'));

const requiredPaths = [
  manifest.runtime.canonical_app,
  ...manifest.runtime.browser_entrypoints,
  manifest.docs.bootstrap,
  manifest.docs.task_router,
  manifest.docs.codebase_map,
  manifest.docs.repo_structure,
  ...manifest.workflows,
];

for (const entry of requiredPaths) {
  test(`active surface exists: ${entry}`, () => {
    assert.equal(fs.existsSync(entry), true);
  });
}

test('validation manifest preserves canonical gates', () => {
  assert.equal(manifest.validation.fast_gate, 'npm run validate');
  assert.equal(manifest.validation.release_gate, 'npm run validate:release');
});
