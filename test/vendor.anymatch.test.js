'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const anymatch = require(path.join(
  __dirname,
  '..',
  'astro-poc',
  'node_modules',
  'anymatch'
));

test('vendored anymatch preserves basic glob and direct string matching', () => {
  const matcher = anymatch(['assets/**/*.png', 'robots.txt']);

  assert.equal(matcher('assets/images/logo.png'), true);
  assert.equal(matcher('robots.txt'), true);
  assert.equal(matcher('assets/images/logo.jpg'), false);
});

test('vendored anymatch preserves negated glob behavior', () => {
  const matcher = anymatch(['assets/**/*.png', '!assets/private/**']);

  assert.equal(matcher('assets/images/logo.png'), true);
  assert.equal(matcher('assets/private/logo.png'), false);
});

test('vendored anymatch preserves regexp and function matcher behavior', () => {
  const matcher = anymatch([
    /^pages\/.+\.html$/,
    (value) => value.endsWith('/service-worker.js'),
  ]);

  assert.equal(matcher('pages/bebidas.html'), true);
  assert.equal(matcher('astro-poc/dist/service-worker.js'), true);
  assert.equal(matcher('astro-poc/dist/index.html'), false);
});

test('vendored anymatch supports returnIndex mode', () => {
  const matcher = anymatch(['robots.txt', 'sitemap.xml']);

  assert.equal(matcher('sitemap.xml', true), 1);
  assert.equal(matcher('missing.xml', true), -1);
});
