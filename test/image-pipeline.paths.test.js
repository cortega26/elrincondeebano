const test = require('node:test');
const assert = require('node:assert/strict');
const { readRepoFile } = require('./helpers/repo-files.js');

test('image pipeline uses assets/images originals and variants', () => {
  const generate = readRepoFile('tools/generate-images.mjs');
  assert.match(generate, /'assets', 'images', 'originals'/);
  assert.match(generate, /'assets', 'images', 'variants'/);

  const rewrite = readRepoFile('tools/rewrite-images.mjs');
  assert.match(rewrite, /\/assets\/images\/originals\//);
  assert.match(rewrite, /\/assets\/images\/variants/);

  const lint = readRepoFile('tools/lint-images.mjs');
  assert.match(lint, /\/assets\/images\/originals\//);
  assert.match(lint, /\/assets\/images\/variants/);
});
