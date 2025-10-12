const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const SCRIPT_BUNDLE_PATH = '/dist/js/script.min.js';
const LOGO_CDN_PREFIX = '/cdn-cgi/image/';

function loadDocument(relPath) {
  const filePath = path.join(__dirname, '..', relPath);
  const html = fs.readFileSync(filePath, 'utf8');
  return new JSDOM(html).window.document;
}

test('index.html preloads the module bundle and logo consistently', () => {
  const document = loadDocument('index.html');
  const modulePreloads = Array.from(document.querySelectorAll('link[rel="modulepreload"]'));

  assert.strictEqual(
    modulePreloads.length,
    1,
    'index.html should include exactly one modulepreload hint'
  );
  assert.strictEqual(
    modulePreloads[0].getAttribute('href'),
    SCRIPT_BUNDLE_PATH,
    'modulepreload must match the bundled script path'
  );

  const moduleScript = document.querySelector('script[type="module"]');
  assert.ok(moduleScript, 'module script tag should be present');
  assert.strictEqual(
    moduleScript.getAttribute('src'),
    SCRIPT_BUNDLE_PATH,
    'module script src must align with preload hint'
  );

  const legacyScriptPreload = document.querySelector('link[rel="preload"][as="script"]');
  assert.strictEqual(legacyScriptPreload, null, 'legacy script preloads should be removed');

  const logoPreloads = Array.from(
    document.querySelectorAll('link[rel="preload"][as="image"]')
  ).filter((link) => link.getAttribute('href')?.includes('logo.webp'));

  assert.ok(logoPreloads.length > 0, 'logo preload hint should be present');
  logoPreloads.forEach((link) => {
    const href = link.getAttribute('href');
    assert.ok(
      href.startsWith(LOGO_CDN_PREFIX),
      `logo preload must use CDN path, received ${href}`
    );
  });
});

test('category pages reuse modulepreload and CDN logo hints', () => {
  const document = loadDocument('pages/despensa.html');

  const modulePreloads = Array.from(document.querySelectorAll('link[rel="modulepreload"]'));
  assert.strictEqual(modulePreloads.length, 1, 'category page should have one modulepreload');
  assert.strictEqual(
    modulePreloads[0].getAttribute('href'),
    SCRIPT_BUNDLE_PATH,
    'category modulepreload should reference the shared bundle'
  );

  const moduleScript = document.querySelector('script[type="module"]');
  assert.ok(moduleScript, 'category page must include module script tag');
  assert.strictEqual(
    moduleScript.getAttribute('src'),
    SCRIPT_BUNDLE_PATH,
    'category module script src must match preload path'
  );

  const legacyScriptPreload = document.querySelector('link[rel="preload"][as="script"]');
  assert.strictEqual(legacyScriptPreload, null, 'category page should not preload scripts via rel="preload"');

  const logoPreloads = Array.from(
    document.querySelectorAll('link[rel="preload"][as="image"]')
  ).filter((link) => link.getAttribute('href')?.includes('logo.webp'));

  assert.strictEqual(logoPreloads.length, 1, 'category should preload the logo once');
  assert.ok(
    logoPreloads[0].getAttribute('href').startsWith(LOGO_CDN_PREFIX),
    'category logo preload must use CDN path'
  );
});
