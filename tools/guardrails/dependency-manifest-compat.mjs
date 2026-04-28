import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');

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

const rootManifest = readJson('package.json').json;
const workspaceManifestPaths = Array.isArray(rootManifest.workspaces)
  ? rootManifest.workspaces
      .filter((workspacePath) => typeof workspacePath === 'string')
      .map((workspacePath) => path.posix.join(workspacePath, 'package.json'))
  : [];
const manifestPaths = ['package.json', ...workspaceManifestPaths];

const errors = [];

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
  console.error('Dependency manifest compatibility guard failed.\n');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('Dependency manifest compatibility guard passed.');
