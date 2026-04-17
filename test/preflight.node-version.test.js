'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { validateNodeVersion, buildNodeVersionErrorMessage } = require('../tools/preflight.js');

test('validateNodeVersion accepts a compatible semver range match', () => {
  const result = validateNodeVersion('24.0.0', '>=24 <25');
  assert.equal(result.ok, true);
  assert.equal(result.reason, 'ok');
});

test('validateNodeVersion rejects a non-compliant version in semver range', () => {
  const result = validateNodeVersion('23.11.1', '>=24 <25');
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'out-of-range');
});

test('preflight error message includes range, detected version, and fix hints', () => {
  const message = buildNodeVersionErrorMessage('>=24 <25', '23.11.1', 'out-of-range');
  assert.match(message, /Required range:\s*>=24 <25/);
  assert.match(message, /Detected version:\s*23\.11\.1/);
  assert.match(message, /nvm use 24/);
  assert.match(message, /volta install node@24/);
  assert.match(message, /node\.exe/);
});
