'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  validateNodeVersion,
  buildNodeVersionErrorMessage,
} = require('../tools/preflight.js');

test('validateNodeVersion accepts a compatible semver range match', () => {
  const result = validateNodeVersion('22.20.0', '>=22 <25');
  assert.equal(result.ok, true);
  assert.equal(result.reason, 'ok');
});

test('validateNodeVersion rejects a non-compliant version in semver range', () => {
  const result = validateNodeVersion('25.6.1', '>=22 <25');
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'out-of-range');
});

test('preflight error message includes range, detected version, and fix hints', () => {
  const message = buildNodeVersionErrorMessage('>=22 <25', '25.6.1', 'out-of-range');
  assert.match(message, /Required range:\s*>=22 <25/);
  assert.match(message, /Detected version:\s*25\.6\.1/);
  assert.match(message, /nvm use 22/);
  assert.match(message, /volta install node@22/);
  assert.match(message, /node\.exe/);
});

