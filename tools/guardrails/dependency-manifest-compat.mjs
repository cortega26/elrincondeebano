import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from '../utils/logger.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');

const ROOT_MANIFEST = 'package.json';

function readJson(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);
  return {
    absolutePath,
    relativePath,
    json: JSON.parse(fs.readFileSync(absolutePath, 'utf8')),
  };
}

function getDeclaredVersion(manifest, packageName) {
  return (
    manifest.dependencies?.[packageName] ??
    manifest.devDependencies?.[packageName] ??
    manifest.optionalDependencies?.[packageName] ??
    null
  );
}

function parseSemverTriplet(range) {
  const match = String(range).match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    return null;
  }

  return match.slice(1).map((value) => Number.parseInt(value, 10));
}

function compareTriplets(left, right) {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] > right[index]) {
      return 1;
    }
    if (left[index] < right[index]) {
      return -1;
    }
  }
  return 0;
}

const rootManifest = readJson(ROOT_MANIFEST).json;
const workspaceManifestPaths = Array.isArray(rootManifest.workspaces)
  ? rootManifest.workspaces
      .filter((workspacePath) => typeof workspacePath === 'string')
      .map((workspacePath) => path.posix.join(workspacePath, 'package.json'))
  : [];
const manifestPaths = [ROOT_MANIFEST, ...workspaceManifestPaths];

const errors = [];

// Plan 200 step 4: same-range assertion for ranges duplicated across
// workspaces — a one-sided bump silently forks the install tree (notably
// sharp's native binaries). The typescript split is EXEMPT by design
// (plan 113: root/astro on TS6, admin on TS7 — peers block convergence).
// Maintenance rule: extend SAME_RANGE_PACKAGES when adding a new
// cross-workspace duplicate.
const SAME_RANGE_PACKAGES = [
  'sharp',
  'zod',
  'vitest',
  '@vitest/coverage-v8',
  'jsdom',
  '@playwright/test',
  'eslint-plugin-sonarjs',
];

for (const packageName of SAME_RANGE_PACKAGES) {
  const declared = new Map();
  for (const manifestPath of manifestPaths) {
    const { json: manifest, relativePath } = readJson(manifestPath);
    const range = getDeclaredVersion(manifest, packageName);
    if (range) {
      declared.set(relativePath, range);
    }
  }
  const ranges = new Set(declared.values());
  if (ranges.size > 1) {
    errors.push(
      `${packageName} range differs across manifests: ` +
        [...declared.entries()].map(([file, range]) => `${file}=${range}`).join(', ') +
        `. Bump all workspaces together.`
    );
  }
}

for (const manifestPath of manifestPaths) {
  const { json: manifest, relativePath } = readJson(manifestPath);
  const typescriptRange = getDeclaredVersion(manifest, 'typescript');
  const astroCheckRange = getDeclaredVersion(manifest, '@astrojs/check');

  if (!typescriptRange || !astroCheckRange) {
    continue;
  }

  const typescriptVersion = parseSemverTriplet(typescriptRange);
  const astroCheckVersion = parseSemverTriplet(astroCheckRange);

  if (!typescriptVersion || !astroCheckVersion) {
    errors.push(
      `${relativePath}: unable to parse versions for typescript (${typescriptRange}) and/or @astrojs/check (${astroCheckRange}).`
    );
    continue;
  }

  if (typescriptVersion[0] >= 6 && compareTriplets(astroCheckVersion, [0, 9, 9]) < 0) {
    errors.push(
      `${relativePath}: typescript ${typescriptRange} requires @astrojs/check >= 0.9.9. ` +
        `Upgrade @astrojs/check (recommended: ^0.9.9 or newer) or keep TypeScript on a 5.x line until the peer range is compatible.`
    );
  }
}

if (errors.length > 0) {
  logger.error('dependency-manifest-compat-failed', { errors });
  console.error('Dependency manifest compatibility guard failed.\n');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

logger.info('dependency-manifest-compat-passed', {});
console.log('Dependency manifest compatibility guard passed.');
