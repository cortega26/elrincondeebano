const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(repoRoot, relPath), 'utf8');

test('image pipeline uses assets/images originals and variants', () => {
  const generate = read('tools/generate-images.mjs');
  assert.match(generate, /'assets', 'images', 'originals'/);
  assert.match(generate, /'assets', 'images', 'variants'/);

  const rewrite = read('tools/rewrite-images.mjs');
  assert.match(rewrite, /\/assets\/images\/originals\//);
  assert.match(rewrite, /\/assets\/images\/variants/);

  const lint = read('tools/lint-images.mjs');
  assert.match(lint, /\/assets\/images\/originals\//);
  assert.match(lint, /\/assets\/images\/variants/);
});
