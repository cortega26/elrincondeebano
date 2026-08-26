'use strict';

// Guard for vendored anymatch dir↔tgz drift (plan 160).
// The check compares extracted file contents (sha256), not raw tgz bytes,
// so gzip timestamp non-determinism is ignored.
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');

async function loadCheck() {
  return import('../tools/check-vendor-tgz.mjs');
}

test('vendor-tgz helpers: identical dirs produce no diff', async () => {
  const { collectFiles, compareFileSets } = await loadCheck();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vtgz-helper-'));
  try {
    const a = path.join(tmp, 'a');
    const b = path.join(tmp, 'b');
    fs.mkdirSync(a, { recursive: true });
    fs.mkdirSync(b, { recursive: true });
    fs.writeFileSync(path.join(a, 'index.js'), 'hello');
    fs.writeFileSync(path.join(a, 'package.json'), '{"a":1}');
    fs.writeFileSync(path.join(b, 'index.js'), 'hello');
    fs.writeFileSync(path.join(b, 'package.json'), '{"a":1}');
    const mapA = collectFiles(a);
    const mapB = collectFiles(b);
    const { mismatched, missingInB, extraInB } = compareFileSets(mapA, mapB);
    assert.strictEqual(mismatched.length, 0);
    assert.strictEqual(missingInB.length, 0);
    assert.strictEqual(extraInB.length, 0);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('vendor-tgz helpers: mutated file is detected', async () => {
  const { collectFiles, compareFileSets } = await loadCheck();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vtgz-helper-mut-'));
  try {
    const a = path.join(tmp, 'a');
    const b = path.join(tmp, 'b');
    fs.mkdirSync(a, { recursive: true });
    fs.mkdirSync(b, { recursive: true });
    fs.writeFileSync(path.join(a, 'index.js'), 'original');
    fs.writeFileSync(path.join(b, 'index.js'), 'MUTATED');
    const mapA = collectFiles(a);
    const mapB = collectFiles(b);
    const { mismatched } = compareFileSets(mapA, mapB);
    assert.strictEqual(mismatched.length, 1);
    assert.strictEqual(mismatched[0], 'index.js');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('vendor-tgz helpers: extra file is detected', async () => {
  const { collectFiles, compareFileSets } = await loadCheck();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vtgz-extra-'));
  try {
    const a = path.join(tmp, 'a');
    const b = path.join(tmp, 'b');
    fs.mkdirSync(a, { recursive: true });
    fs.mkdirSync(b, { recursive: true });
    fs.writeFileSync(path.join(a, 'index.js'), 'hello');
    fs.writeFileSync(path.join(a, 'LICENSE'), 'mit');
    fs.writeFileSync(path.join(b, 'index.js'), 'hello');
    const mapA = collectFiles(a);
    const mapB = collectFiles(b);
    const { missingInB } = compareFileSets(mapA, mapB);
    assert.ok(missingInB.includes('LICENSE'));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('vendor-tgz check passes on the real repository (post-repack)', async () => {
  const { checkVendorTgz } = await loadCheck();
  const result = checkVendorTgz();
  assert.strictEqual(result.ok, true, result.error ?? 'expected check to pass');
  assert.ok(result.committedFiles.size >= 3);
  // After repack the tgz contains LICENSE and README (npm pack includes them)
  assert.ok(result.committedFiles.has('LICENSE'), 'expected LICENSE in tgz');
  assert.ok(result.committedFiles.has('README.md'), 'expected README.md in tgz');
  assert.ok(result.committedFiles.has('package.json'));
  assert.ok(result.committedFiles.has('index.js'));
  assert.ok(result.committedFiles.has('index.d.ts'));
});

test('vendor-tgz check fails when the dir is deliberately mutated', async () => {
  const { checkVendorTgz } = await loadCheck();
  const vendorDir = path.join(ROOT, 'astro-poc/vendor/anymatch');
  const tgzPath = path.join(vendorDir, 'anymatch-3.1.3.tgz');
  const tmpVendor = fs.mkdtempSync(path.join(os.tmpdir(), 'vtgz-mut-vendor-'));
  try {
    // Copy vendor dir contents to temp
    fs.cpSync(vendorDir, tmpVendor, { recursive: true });
    // Mutate index.js
    const idx = path.join(tmpVendor, 'index.js');
    const original = fs.readFileSync(idx, 'utf8');
    fs.writeFileSync(idx, `${original}\n// MUTATION FOR TEST\n`);
    const result = checkVendorTgz({ vendorDir: tmpVendor, tgzPath });
    assert.strictEqual(result.ok, false, 'expected mutated dir to fail the check');
    assert.ok(
      result.mismatched?.includes('index.js') || result.error?.includes('index.js'),
      `expected index.js mismatch, got: ${result.error}`
    );
  } finally {
    fs.rmSync(tmpVendor, { recursive: true, force: true });
  }
});

test('vendor-tgz CLI passes via node invocation', () => {
  const out = execFileSync(process.execPath, ['tools/check-vendor-tgz.mjs'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  assert.match(out, /Vendor tgz check passed/);
});

test('vendor-tgz CLI is wired into check:determinism', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.ok(
    pkg.scripts['check:determinism'].includes('check-vendor-tgz.mjs'),
    'check:determinism must chain check-vendor-tgz.mjs'
  );
});
