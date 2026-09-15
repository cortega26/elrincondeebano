const assert = require('node:assert/strict');
const { readRepoFile } = require('./helpers/repo-files.js');

test('image pipeline uses assets/images originals and variants', () => {
  // Plan 186: generate-images.mjs retired (orphan layout, nothing invoked
  // it) — the live producers are gap-fill (variants) and sync-avif-assets.
  const gapFill = readRepoFile('tools/gap-fill-image-variants.js');
  assert.match(gapFill, /'assets', 'images', 'variants'/);

  const syncAvif = readRepoFile('tools/sync-avif-assets.js');
  assert.match(syncAvif, /product_data\.json/);
  assert.match(syncAvif, /runTasksBounded/);

  const rewrite = readRepoFile('tools/rewrite-images.mjs');
  assert.match(rewrite, /\/assets\/images\/originals\//);
  assert.match(rewrite, /\/assets\/images\/variants/);

  const lint = readRepoFile('tools/lint-images.mjs');
  assert.match(lint, /\/assets\/images\/originals\//);
  assert.match(lint, /\/assets\/images\/variants/);
});
