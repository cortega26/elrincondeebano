'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('storefront checkout records a submitted order only once', () => {
  const storefrontPath = path.join(__dirname, '..', 'astro-poc', 'src', 'scripts', 'storefront.js');
  const source = fs.readFileSync(storefrontPath, 'utf8');
  const recordOrderCalls = source.match(/personalizationEngine\.recordOrder\(/g) || [];

  assert.equal(recordOrderCalls.length, 1);
});
