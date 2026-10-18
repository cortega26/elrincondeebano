'use strict';

// Enforces the .env.example maintenance rule (plan 204/226): every
// `process.env.<NAME>` read in runtime code must be documented in
// `.env.example` in the same commit. Test-local files and generated trees are
// skipped; namespaces injected by the runtime are allowlisted below, each with
// a one-line justification.

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const SCAN_ROOTS = [
  'tools',
  'scripts',
  'astro-poc/src',
  'admin/content-manager/src',
  'infra',
  '.github',
];

const SCAN_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.astro', '.yml', '.yaml']);

const SKIP_DIRECTORIES = new Set([
  'node_modules',
  'dist',
  '.astro',
  'coverage',
  'playwright-report',
  'test-results',
]);

// Test-local stubs read arbitrary names without operator-facing documentation.
const SKIP_FILE_PATTERN = /\.(test|spec)\.[cm]?[jt]sx?$/;

// Namespaces injected by the runtime, never by `.env`. Matched as prefixes.
const RUNTIME_ALLOWLIST = [
  ['npm_', 'npm lifecycle injects npm_* (npm_config_*, npm_lifecycle_event).'],
  ['NODE_', 'Node runtime injects NODE_* (NODE_ENV, NODE_OPTIONS).'],
];

// CI-provided names (GITHUB_*, CI_SKIP_BUILD_CONTRACT, SOURCE_DATE_EPOCH) are
// documented on purpose in the `.env.example` "CI-provided" section, so this
// test enforces them like any other name instead of allowlisting them.

function isAllowlisted(name) {
  return RUNTIME_ALLOWLIST.some(([prefix]) => name.startsWith(prefix));
}

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRECTORIES.has(entry.name)) walk(fullPath, files);
      continue;
    }
    if (SKIP_FILE_PATTERN.test(entry.name)) continue;
    if (SCAN_EXTENSIONS.has(path.extname(entry.name))) files.push(fullPath);
  }
  return files;
}

function collectEnvReads() {
  const reads = new Map(); // NAME -> ["file:line", ...]
  const envPattern = /\bprocess\.env\.([A-Za-z_][A-Za-z0-9_]*)\b/g;
  for (const root of SCAN_ROOTS) {
    for (const file of walk(root)) {
      const lines = fs.readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, index) => {
        for (const match of line.matchAll(envPattern)) {
          const locations = reads.get(match[1]) ?? [];
          locations.push(`${file}:${index + 1}`);
          reads.set(match[1], locations);
        }
      });
    }
  }
  return reads;
}

function documentedEnvNames() {
  const names = new Set();
  const text = fs.readFileSync('.env.example', 'utf8');
  for (const rawLine of text.split('\n')) {
    const line = rawLine.replace(/^\s*#*\s?/, '').trim();
    const assignment = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (assignment) names.add(assignment[1]);
    // Bare mentions in comments, e.g. `# GITHUB_RUN_ID / GITHUB_SHA — ...`.
    for (const match of line.matchAll(/\b[A-Z][A-Z0-9]*_[A-Z0-9_]+\b/g)) names.add(match[0]);
  }
  return names;
}

test('env scan roots exist (guard against silent no-op renames)', () => {
  for (const root of SCAN_ROOTS) {
    assert.equal(fs.existsSync(root), true, `scan root missing: ${root}`);
  }
});

test('every process.env read is documented in .env.example', () => {
  const reads = collectEnvReads();
  assert.ok(reads.size > 0, 'env scan found no process.env reads — check SCAN_ROOTS');

  const documented = documentedEnvNames();
  const undocumented = [...reads.entries()]
    .filter(([name]) => !documented.has(name) && !isAllowlisted(name))
    .map(([name, locations]) => `${name} (${locations.join(', ')})`);

  assert.deepEqual(
    undocumented,
    [],
    `Undocumented process.env vars — add each to .env.example (plan 204 rule):\n${undocumented.join('\n')}`
  );
});
