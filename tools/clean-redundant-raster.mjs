import { readdirSync, statSync, unlinkSync, existsSync } from 'node:fs';
import { join, extname, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const PUBLIC_IMAGES = join(REPO_ROOT, 'astro-poc', 'public', 'assets', 'images');

const ALT_FORMATS = ['.avif', '.webp'];
const SOURCE_FORMATS = ['.png', '.jpg', '.jpeg'];

function walk(dir) {
  if (!existsSync(dir)) return;

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath);
    } else if (entry.isFile() && SOURCE_FORMATS.includes(extname(entry.name).toLowerCase())) {
      const base = fullPath.slice(0, -extname(entry.name).length);
      for (const alt of ALT_FORMATS) {
        if (existsSync(base + alt)) {
          const sizeKb = Math.round(statSync(fullPath).size / 1024);
          unlinkSync(fullPath);
          const relPath = fullPath.slice(REPO_ROOT.length + 1);
          console.log(`Removed ${relPath} (${sizeKb} KB) — ${alt} equivalent exists`);
          break;
        }
      }
    }
  }
}

walk(PUBLIC_IMAGES);
