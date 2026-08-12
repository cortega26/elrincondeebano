#!/usr/bin/env node
// Fixed rule (user directive 2026-08-12): every plan that goes from TODO to
// DONE must move to plans/archive/ — enforced here, mechanically, so the
// archive step can never be forgotten.
//
// Reads plans/README.md (the index of record): for every table row that
// links a plan file, if the status cell marks the plan DONE, the linked
// file MUST live under plans/archive/. Also verifies linked files exist.
//
// Usage: node tools/check-plan-archive.mjs
// Wired into: npm run validate, lint-staged (plans/**/*.md), CI.

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readmePath = resolve(repoRoot, 'plans', 'README.md');
const readme = readFileSync(readmePath, 'utf8');

const violations = [];
const missing = [];

for (const line of readme.split('\n')) {
  // Table rows look like: | [086](086-fix-sync-integrity.md) | Title | ... | Status |
  const link = line.match(/^\|\s*\[(\d{3})\]\(([^)]+\.md)\)/);
  if (!link) continue;
  const [, number, path] = link;
  const cells = line
    .split('|')
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
  const statusCell = cells[cells.length - 1] ?? '';

  const isDone =
    /\bDONE\b/.test(statusCell) &&
    !/\bPARTIAL\b/.test(statusCell) &&
    !/\bSUPERSEDED\b/.test(statusCell);

  if (isDone && !path.startsWith('archive/')) {
    violations.push(
      `plan ${number} is DONE but lives at plans/${path} — move it to plans/archive/`
    );
  }

  const fullPath = resolve(repoRoot, 'plans', path);
  if (!existsSync(fullPath)) {
    missing.push(`plan ${number}: linked file plans/${path} does not exist`);
  }
}

if (violations.length > 0 || missing.length > 0) {
  console.error('[check-plan-archive] FAILED:');
  for (const v of violations) console.error(`  - ${v}`);
  for (const m of missing) console.error(`  - ${m}`);
  console.error(
    'Rule: a plan marked DONE in plans/README.md must live in plans/archive/ (git mv).'
  );
  process.exit(1);
}

console.log('[check-plan-archive] OK — every DONE plan is archived and links resolve.');
