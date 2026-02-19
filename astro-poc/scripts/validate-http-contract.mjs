import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const distRoot = path.join(projectRoot, 'dist');

const REQUIRED_HTTP_FILES = [
  'index.html',
  '404.html',
  'bebidas.html',
  'vinos.html',
  'e.html',
  'offline.html',
  path.join('pages', 'offline.html'),
];

function main() {
  if (!fs.existsSync(distRoot)) {
    throw new Error(`Missing dist directory: ${distRoot}`);
  }

  const missing = REQUIRED_HTTP_FILES.filter((relativePath) => !fs.existsSync(path.join(distRoot, relativePath)));
  if (missing.length > 0) {
    throw new Error(`HTTP contract failed. Missing required dist files: ${missing.join(', ')}`);
  }

  console.log(`HTTP contract validation passed: ${REQUIRED_HTTP_FILES.length} required files verified.`);
}

main();
