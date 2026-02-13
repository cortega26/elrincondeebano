'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('smoke evidence script generates markdown with required metadata and checklist', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ebano-smoke-evidence-'));
  const outputPath = path.join(tempDir, 'smoke-evidence.md');
  const scriptPath = path.join(process.cwd(), 'scripts', 'smoke-evidence.mjs');

  const result = spawnSync(
    process.execPath,
    [
      scriptPath,
      '--output',
      outputPath,
      '--status',
      'pending',
      '--base-url',
      'https://example.test',
      '--commit',
      'abc123456789',
      '--run-id',
      '12345',
      '--run-url',
      'https://example.test/run/12345',
      '--signed-by',
      'qa-agent',
    ],
    { encoding: 'utf8' }
  );

  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  assert.ok(fs.existsSync(outputPath));

  const content = fs.readFileSync(outputPath, 'utf8');
  assert.match(content, /# Smoke Evidence/);
  assert.match(content, /- Status: pending/);
  assert.match(content, /- Base URL: https:\/\/example\.test/);
  assert.match(content, /- Commit: abc123456789/);
  assert.match(content, /- CI Run ID: 12345/);
  assert.match(content, /- CI Run URL: https:\/\/example\.test\/run\/12345/);
  assert.match(content, /- Signed By: qa-agent/);
  assert.match(content, /- \[ \] Homepage/);
  assert.match(content, /- \[ \] Checkout\/contact/);

  fs.rmSync(tempDir, { recursive: true, force: true });
});
