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
  path.join('pages', 'offline.html'),
  path.join('pages', 'bebidas.html'),
  path.join('pages', 'vinos.html'),
  path.join('c', 'bebidas', 'index.html'),
  path.join('c', 'vinos', 'index.html'),
];

const FORBIDDEN_HTTP_FILES = ['e.html', path.join('pages', 'e.html'), path.join('c', 'e', 'index.html')];
function main() {
  if (!fs.existsSync(distRoot)) {
    throw new Error(`Missing dist directory: ${distRoot}`);
  }

  const missing = REQUIRED_HTTP_FILES.filter((relativePath) => !fs.existsSync(path.join(distRoot, relativePath)));
  if (missing.length > 0) {
    throw new Error(`HTTP contract failed. Missing required dist files: ${missing.join(', ')}`);
  }

  const unexpected = FORBIDDEN_HTTP_FILES.filter((relativePath) => fs.existsSync(path.join(distRoot, relativePath)));
  if (unexpected.length > 0) {
    throw new Error(`HTTP contract failed. Found unexpected stale dist files: ${unexpected.join(', ')}`);
  }

  console.log(
    `HTTP contract validation passed: ${REQUIRED_HTTP_FILES.length} required files verified, ${FORBIDDEN_HTTP_FILES.length} stale paths blocked.`
  );
}

main();
