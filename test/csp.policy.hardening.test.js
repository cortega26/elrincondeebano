'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

function readFile(relPath) {
  const filePath = path.resolve(ROOT, relPath);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing required file: ${relPath}`);
  }
  return fs.readFileSync(filePath, 'utf8');
}

function findScriptTag(source, matcher) {
  const regex = /<script\b[^>]*>/gi;
  let match = regex.exec(source);
  while (match) {
    if (matcher(match[0])) {
      return match[0];
    }
    match = regex.exec(source);
  }
  return null;
}

function assertCspScriptBlocking(relPath) {
  const content = readFile(relPath);
  const tag = findScriptTag(content, (scriptTag) => /csp\.js/i.test(scriptTag));
  assert.ok(tag, `Expected CSP script tag in ${relPath}`);
  assert.ok(!/\basync\b/i.test(tag), `CSP script must not use async in ${relPath}`);
  assert.ok(!/\bdefer\b/i.test(tag), `CSP script must not use defer in ${relPath}`);
}

{
  const cspSource = readFile('src/js/csp.js').replace(/\s+/g, ' ');
  const scriptSrcDirective = cspSource.match(/script-src[^;]+;/i)?.[0] || '';
  assert.ok(scriptSrcDirective, 'script-src directive must exist in src/js/csp.js');
  assert.ok(
    !scriptSrcDirective.includes("'unsafe-inline'"),
    "script-src must not include 'unsafe-inline'"
  );
  assert.ok(
    scriptSrcDirective.includes("'nonce-${cspNonce}'"),
    'script-src must include a nonce-based policy'
  );
}

assertCspScriptBlocking('templates/index.ejs');
assertCspScriptBlocking('templates/category.ejs');
