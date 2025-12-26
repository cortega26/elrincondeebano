const test = require('node:test');
const assert = require('node:assert');
const { shouldIncludeAdminPanel } = require('../tools/copy-static.js');

function restoreEnv(original) {
  if (original === undefined) {
    delete process.env.INCLUDE_ADMIN_PANEL;
  } else {
    process.env.INCLUDE_ADMIN_PANEL = original;
  }
}

test('shouldIncludeAdminPanel defaults to false', () => {
  const original = process.env.INCLUDE_ADMIN_PANEL;
  delete process.env.INCLUDE_ADMIN_PANEL;
  assert.strictEqual(shouldIncludeAdminPanel(), false);
  restoreEnv(original);
});

test('shouldIncludeAdminPanel enables admin panel when set to 1', () => {
  const original = process.env.INCLUDE_ADMIN_PANEL;
  process.env.INCLUDE_ADMIN_PANEL = '1';
  assert.strictEqual(shouldIncludeAdminPanel(), true);
  restoreEnv(original);
});

test('shouldIncludeAdminPanel enables admin panel when set to true', () => {
  const original = process.env.INCLUDE_ADMIN_PANEL;
  process.env.INCLUDE_ADMIN_PANEL = 'true';
  assert.strictEqual(shouldIncludeAdminPanel(), true);
  restoreEnv(original);
});
