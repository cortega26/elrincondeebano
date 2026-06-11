import { readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const IMAGES_ROOT = join(REPO_ROOT, 'assets', 'images');
const PUBLIC_ROOT = join(REPO_ROOT, 'astro-poc', 'public', 'assets', 'images');

const SIZE_WARN_KB = 200;
const SIZE_ERROR_KB = 800;

// OG assets are pipeline source inputs — report as warnings only.
const SOURCE_OG_DIR = join(REPO_ROOT, 'assets', 'images', 'og');

function isOgSourceAsset(fullPath) {
  return fullPath.startsWith(SOURCE_OG_DIR);
}

function checkImages(rootDir) {
  if (!existsSync(rootDir)) return { warnings: [], errors: [] };

  const warnings = [];
  const errors = [];

  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && /\.(png|jpe?g|webp|avif|gif)$/i.test(entry.name)) {
        const sizeKb = Math.round(statSync(fullPath).size / 1024);
        const relPath = relative(REPO_ROOT, fullPath);

        if (sizeKb > SIZE_ERROR_KB) {
          if (isOgSourceAsset(fullPath)) {
            warnings.push(
              `${relPath} (${sizeKb} KB) — exceeds ${SIZE_ERROR_KB} KB error threshold (OG pipeline source, warn only)`
            );
          } else {
            errors.push(`${relPath} (${sizeKb} KB) — exceeds ${SIZE_ERROR_KB} KB error threshold`);
          }
        } else if (sizeKb > SIZE_WARN_KB) {
          warnings.push(`${relPath} (${sizeKb} KB) — exceeds ${SIZE_WARN_KB} KB warning threshold`);
        }
      }
    }
  }

  walk(rootDir);
  return { warnings, errors };
}

function main() {
  const allWarnings = [];
  const allErrors = [];

  for (const root of [IMAGES_ROOT, PUBLIC_ROOT]) {
    const { warnings, errors } = checkImages(root);
    for (const w of warnings) allWarnings.push(w);
    for (const e of errors) allErrors.push(e);
  }

  if (allWarnings.length) {
    console.warn('Large image assets detected (warn):');
    for (const w of allWarnings) console.warn(`- ${w}`);
  }

  if (allErrors.length) {
    console.error('Oversized image assets detected (error):');
    for (const e of allErrors) console.error(`- ${e}`);
  }

  if (allErrors.length > 0) {
    process.exitCode = 1;
  } else if (allWarnings.length > 0) {
    console.warn(`\n${allWarnings.length} large image(s) — consider compressing.`);
  } else {
    console.log('Image size check passed — no assets exceed thresholds.');
  }
}

main();
