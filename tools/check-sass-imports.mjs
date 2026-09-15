// Plan 203: Sass @import quarantine guard.
//
// Bootstrap 5.3's own partials depend on @import-order globals (proven:
// naive @use breaks on `_assert-ascending` in _variables.scss), so the 24
// @imports in bootstrap-needed.scss stay until Bootstrap 6 — but NO new
// Sass @import may appear anywhere else. Plain CSS @import (app.css) is
// native CSS, not Sass-deprecated, and is out of scope.
//
// Quarantine: exactly one file (bootstrap-needed.scss) may contain Sass
// @import. Everything else under astro-poc/src/**/*.scss must use @use.
// Fails CI (static-checks) and pre-commit (lint-staged *.scss entry).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const STYLES_ROOT = path.join(repoRoot, 'astro-poc', 'src');
const QUARANTINED = path.join('styles', 'bootstrap-needed.scss');

function collectScss(dir) {
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...collectScss(full));
    } else if (entry.isFile() && entry.name.endsWith('.scss')) {
      found.push(full);
    }
  }
  return found;
}

// lint-staged passes staged filenames; default to the full tree scan.
const targets = process.argv.slice(2).filter((arg) => arg.endsWith('.scss'));
const files =
  targets.length > 0 ? targets.map((arg) => path.resolve(arg)) : collectScss(STYLES_ROOT);

const violations = [];
for (const file of files) {
  const relative = path.relative(path.join(repoRoot, 'astro-poc', 'src'), file);
  if (relative === QUARANTINED) {
    continue;
  }
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, index) => {
    const stripped = line.replace(/\/\/.*$/, '').trim();
    if (/^@import\s+['"]/.test(stripped)) {
      violations.push(`${path.relative(repoRoot, file)}:${index + 1}: ${stripped}`);
    }
  });
}

if (violations.length > 0) {
  console.error('Sass @import outside the bootstrap-needed.scss quarantine:\n');
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  console.error('\nNew stylesheets MUST use @use (plan 203).');
  process.exit(1);
}

console.log('Sass @import quarantine guard passed.');
