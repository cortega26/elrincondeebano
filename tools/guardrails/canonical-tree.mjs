// Guard: the canonical Content Manager tree must stay committed and clean.
//
// Covers the plan 070 regression classes:
//   1. F1 — admin/content-manager/ declared canonical but untracked again.
//   2. F2 — regenerable e2e reports committed under admin/content-manager/reports.
//   3. Plan 070 Step 4 — the stray package-lock-worktree.json resurrected.
//   4. Pre-commit hook losing the lint-staged --concurrent flag (SIGKILL
//      regression on large staged sets).
//
// Note: _utils.ok()/fail() exit immediately, so this check accumulates every
// violation and reports them all at once instead.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sh, ok, fail } from './_utils.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..', '..');

function tracked(dir) {
  const out = sh(`git ls-files ${dir}`);
  return out ? out.split(/\r?\n/).filter(Boolean) : [];
}

const violations = [];

// 1. Canonical tree is committed.
const canonicalFiles = tracked('admin/content-manager');
if (canonicalFiles.length === 0) {
  violations.push(
    'admin/content-manager/ has no tracked files — the tree was declared canonical ' +
      'but is untracked again. Commit it (see plans/070).'
  );
}

// 2. No generated reports committed.
const reportFiles = tracked('admin/content-manager/reports');
if (reportFiles.length > 0) {
  violations.push(
    `Generated e2e reports are committed under admin/content-manager/reports ` +
      `(${reportFiles.length} files: ${reportFiles.join(', ')}). ` +
      `Remove them — they are regenerable artifacts with machine paths.`
  );
}

// 3. Stray worktree lockfile did not come back.
const strayLock = path.join(root, 'package-lock-worktree.json');
if (fs.existsSync(strayLock)) {
  violations.push(
    'package-lock-worktree.json exists at repo root — stray artifact, delete it (see plans/070).'
  );
}

// 4. Pre-commit hook keeps the lint-staged concurrency flag.
const hookPath = path.join(root, '.husky', 'pre-commit');
const hookContent = fs.existsSync(hookPath) ? fs.readFileSync(hookPath, 'utf8') : '';
if (!hookContent.includes('--concurrent')) {
  violations.push(
    '.husky/pre-commit must pass --concurrent to lint-staged — full-parallel runs are ' +
      'SIGKILLed under the sandbox memory budget when ~200 files are staged at once.'
  );
}

if (violations.length > 0) {
  fail(`Canonical tree guard violations:\n- ${violations.join('\n- ')}`);
}

ok(
  `Canonical Content Manager tree tracked (${canonicalFiles.length} files), no ` +
    `committed reports, no stray lockfile, hook concurrency flag present.`
);
