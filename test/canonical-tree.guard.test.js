'use strict';

// Tests for tools/guardrails/canonical-tree.mjs — the plan 070 regression
// guards (canonical tree tracked, no committed reports, no stray lockfile,
// hook concurrency flag).
const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync, execSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const ROOT = path.resolve(__dirname, '..');
const GUARD = path.join(ROOT, 'tools', 'guardrails', 'canonical-tree.mjs');

function runGuard(cwd) {
  try {
    const stdout = execFileSync(process.execPath, [GUARD], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { status: 0, stdout };
  } catch (error) {
    return {
      status: error.status ?? 1,
      stdout: error.stdout?.toString() ?? '',
      stderr: error.stderr?.toString() ?? '',
    };
  }
}

test('canonical-tree guard passes on the real repository', () => {
  const result = runGuard(ROOT);
  assert.strictEqual(result.status, 0, `guard failed: ${result.stderr || result.stdout}`);
  assert.match(result.stdout, /Canonical Content Manager tree tracked \(\d+ files\)/);
  assert.match(result.stdout, /no committed reports/);
  assert.match(result.stdout, /no stray lockfile/);
  assert.match(result.stdout, /hook concurrency flag present/);
});

test('canonical-tree guard fails when the canonical tree is untracked', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-guard-'));
  try {
    execSync('git init -q', { cwd: tmp, stdio: 'ignore' });
    const result = runGuard(tmp);
    assert.notStrictEqual(result.status, 0);
    assert.match(result.stderr, /no tracked files/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
