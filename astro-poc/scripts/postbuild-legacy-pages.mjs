import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const pagesRoot = path.join(projectRoot, 'dist', 'pages');
const distRoot = path.join(projectRoot, 'dist');

if (!fs.existsSync(pagesRoot)) {
  console.log('No legacy pages output found; skipping flattening.');
  process.exit(0);
}

const entries = fs.readdirSync(pagesRoot, { withFileTypes: true });
let rewrittenCount = 0;

for (const entry of entries) {
  if (!entry.isDirectory() || !entry.name.endsWith('.html')) {
    continue;
  }

  const legacyDir = path.join(pagesRoot, entry.name);
  const nestedIndex = path.join(legacyDir, 'index.html');
  if (!fs.existsSync(nestedIndex)) {
    continue;
  }

  const flattenedFile = path.join(pagesRoot, entry.name);
  const tempFile = path.join(pagesRoot, `${entry.name}.tmp`);
  fs.copyFileSync(nestedIndex, tempFile);
  fs.rmSync(legacyDir, { recursive: true, force: true });
  fs.renameSync(tempFile, flattenedFile);
  rewrittenCount += 1;
}

console.log(`Flattened ${rewrittenCount} legacy /pages/*.html routes.`);

const nested404 = path.join(distRoot, '404', 'index.html');
const flat404 = path.join(distRoot, '404.html');
if (fs.existsSync(nested404)) {
  fs.copyFileSync(nested404, flat404);
  console.log('Generated dist/404.html compatibility file.');
}
