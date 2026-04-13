'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

async function loadGuardrail() {
  return import('../tools/guardrails/legacy-storefront-surface.mjs');
}

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

test('legacy storefront surface guard flags active docs and runner references', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ebano-legacy-surface-'));
  writeFile(path.join(repoRoot, 'README.md'), 'See templates/index.ejs for the active storefront.');
  writeFile(
    path.join(repoRoot, 'test', 'run-all.js'),
    "const tests = ['buildIndex.lcp.test.js'];\n"
  );
  writeFile(path.join(repoRoot, 'templates', 'index.ejs'), '<main></main>');

  const { findLegacyStorefrontSurfaceReferences } = await loadGuardrail();
  const findings = findLegacyStorefrontSurfaceReferences({ repoRoot });

  assert.deepStrictEqual(findings, [
    { file: 'templates', label: 'legacy storefront path still present in repository root' },
    { file: 'README.md', label: 'legacy templates presented as active storefront surface' },
    { file: 'test/run-all.js', label: 'legacy test entry buildIndex.lcp.test.js' },
  ]);

  fs.rmSync(repoRoot, { recursive: true, force: true });
});

test('legacy storefront surface guard allows Astro-first docs and default runner', async () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ebano-legacy-surface-clean-'));
  writeFile(path.join(repoRoot, 'README.md'), 'The active storefront lives in astro-poc/dist.');
  writeFile(path.join(repoRoot, 'AGENTS.md'), 'Guardrails mention assets/images and tools only.');
  writeFile(
    path.join(repoRoot, 'test', 'run-all.js'),
    "const tests = ['csp.policy.hardening.test.js'];\n"
  );

  const { findLegacyStorefrontSurfaceReferences } = await loadGuardrail();
  const findings = findLegacyStorefrontSurfaceReferences({ repoRoot });

  assert.deepStrictEqual(findings, []);

  fs.rmSync(repoRoot, { recursive: true, force: true });
});
