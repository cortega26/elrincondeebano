import { readdirSync, statSync, unlinkSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

const OG_CATEGORIES_DIR = join(
  REPO_ROOT,
  'astro-poc',
  'public',
  'assets',
  'images',
  'og',
  'categories'
);
const OG_ROOT_DIR = join(REPO_ROOT, 'astro-poc', 'public', 'assets', 'images', 'og');

function cleanOverrideFiles(dir) {
  if (!existsSync(dir)) return { removed: 0, bytes: 0 };

  let removed = 0;
  let totalBytes = 0;
  for (const entry of readdirSync(dir)) {
    if (
      entry.endsWith('.override.png') ||
      entry.endsWith('.override.jpg') ||
      entry.endsWith('.override.jpeg')
    ) {
      const fullPath = join(dir, entry);
      const size = statSync(fullPath).size;
      unlinkSync(fullPath);
      totalBytes += size;
      removed += 1;
    }
  }
  return { removed, bytes: totalBytes };
}

function cleanSourceAssets(dir) {
  // Source pipeline assets that should not be copied to dist.
  const sourcePatterns = ['logo.png'];
  if (!existsSync(dir)) return { removed: 0, bytes: 0 };

  let removed = 0;
  let totalBytes = 0;
  for (const entry of readdirSync(dir)) {
    if (sourcePatterns.includes(entry)) {
      const fullPath = join(dir, entry);
      const size = statSync(fullPath).size;
      unlinkSync(fullPath);
      totalBytes += size;
      removed += 1;
    }
  }
  return { removed, bytes: totalBytes };
}

const catResult = cleanOverrideFiles(OG_CATEGORIES_DIR);
const rootResult = cleanSourceAssets(OG_ROOT_DIR);

const totalRemoved = catResult.removed + rootResult.removed;
const totalBytes = catResult.bytes + rootResult.bytes;

if (totalRemoved > 0) {
  const kb = Math.round(totalBytes / 1024);
  console.log(
    `OG cleanup: removed ${totalRemoved} source file(s) (${kb} KB) from public directory.`
  );
}
