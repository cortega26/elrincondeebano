const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { pathToFileURL } = require('url');

const slugifyModuleUrl = pathToFileURL(path.join(__dirname, '..', 'src/js/utils/slugify.mjs')).href;

async function loadSlugify() {
  const module = await import(slugifyModuleUrl);
  return module.slugify;
}

test('slugify removes diacritics, punctuation and casing differences', async () => {
  const slugify = await loadSlugify();
  assert.strictEqual(slugify('Energéticas e Isotónicas'), 'energeticaseisotonicas');
  assert.strictEqual(slugify('Snacks  Salados!'), 'snackssalados');
  assert.strictEqual(slugify('  Café & Té  '), 'cafete');
});

test('slugify falls back to empty string for nullish values', async () => {
  const slugify = await loadSlugify();
  assert.strictEqual(slugify(null), '');
  assert.strictEqual(slugify(undefined), '');
});

test('slugify normalizes existing slugs without altering valid output', async () => {
  const slugify = await loadSlugify();
  assert.strictEqual(slugify('snackssalados'), 'snackssalados');
  assert.strictEqual(slugify('SnacksSalados'), 'snackssalados');
});
