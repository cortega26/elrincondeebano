import test from 'node:test';
import assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { setupNavigationAccessibility } from '../assets/js/modules/a11y.js';
import { injectPwaManifest } from '../assets/js/modules/pwa.js';
import { injectStructuredData, injectSeoMetadata } from '../assets/js/modules/seo.js';

test('setupNavigationAccessibility toggles class and inserts style', () => {
  const dom = new JSDOM('<!DOCTYPE html><head></head><body></body>');
  global.window = dom.window;
  global.document = dom.window.document;
  global.location = dom.window.location;

  setupNavigationAccessibility();

  const styleEl = document.querySelector('style');
  assert.ok(styleEl, 'style element should be inserted');

  document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Tab' }));
  assert.ok(document.body.classList.contains('keyboard-navigation'), 'class should be added on Tab');

  document.dispatchEvent(new dom.window.MouseEvent('mousedown'));
  assert.ok(!document.body.classList.contains('keyboard-navigation'), 'class should be removed on mouse click');
});

test('injectPwaManifest adds link only once', () => {
  const dom = new JSDOM('<!DOCTYPE html><head></head><body></body>');
  global.window = dom.window;
  global.document = dom.window.document;
  global.location = dom.window.location;

  injectPwaManifest();
  assert.strictEqual(document.querySelectorAll('link[rel="manifest"]').length, 1, 'manifest link inserted');
  injectPwaManifest();
  assert.strictEqual(document.querySelectorAll('link[rel="manifest"]').length, 1, 'manifest link should not duplicate');
});

test('injectStructuredData and injectSeoMetadata insert expected elements', async () => {
  const dom = new JSDOM('<!DOCTYPE html><head></head><body></body>', { url: 'https://example.com/path' });
  global.window = dom.window;
  global.document = dom.window.document;
  global.location = dom.window.location;
  global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} };
  global.fetch = async () => ({ ok: true, json: async () => ({ products: [] }) });

  await injectStructuredData();
  injectSeoMetadata();

  assert.ok(document.querySelector('script[type="application/ld+json"]'), 'structured data script inserted');
  assert.ok(document.querySelector('link[rel="canonical"]'), 'canonical link inserted');
  assert.ok(document.querySelector('meta[name="description"]'), 'description meta inserted');
});
