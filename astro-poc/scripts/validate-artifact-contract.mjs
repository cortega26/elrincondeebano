import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const distRoot = path.join(projectRoot, 'dist');
const distProductDataPath = path.join(distRoot, 'data', 'product_data.json');

const REQUIRED_FILES = [
  'index.html',
  '404.html',
  'robots.txt',
  'sitemap.xml',
  'service-worker.js',
  path.join('data', 'product_data.json'),
  'bebidas.html',
  'vinos.html',
  'e.html',
  'offline.html',
  path.join('pages', 'offline.html'),
  path.join('pages', 'bebidas.html'),
  path.join('pages', 'vinos.html'),
  path.join('pages', 'e.html'),
];

function ensureFile(relativePath) {
  const absolutePath = path.join(distRoot, relativePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Missing artifact contract file: ${relativePath}`);
  }
}

function ensureAtLeastOneProductDetail() {
  if (!fs.existsSync(distProductDataPath)) {
    throw new Error(`Missing product payload at ${distProductDataPath}`);
  }

  const payload = JSON.parse(fs.readFileSync(distProductDataPath, 'utf8'));
  const products = Array.isArray(payload?.products) ? payload.products : [];
  if (products.length === 0) {
    throw new Error('Artifact contract requires at least one product in dist/data/product_data.json');
  }

  const productRouteRoot = path.join(distRoot, 'p');
  if (!fs.existsSync(productRouteRoot)) {
    throw new Error('Missing product detail route root: p/');
  }

  const hasAnyProductRoute = fs
    .readdirSync(productRouteRoot, { withFileTypes: true })
    .some((entry) => entry.isDirectory() && fs.existsSync(path.join(productRouteRoot, entry.name, 'index.html')));

  if (!hasAnyProductRoute) {
    throw new Error('Artifact contract requires at least one generated product detail route under dist/p/*/index.html');
  }
}

function main() {
  if (!fs.existsSync(distRoot)) {
    throw new Error(`Missing dist directory: ${distRoot}`);
  }

  for (const relativePath of REQUIRED_FILES) {
    ensureFile(relativePath);
  }

  ensureAtLeastOneProductDetail();

  console.log(`Artifact contract validation passed: ${REQUIRED_FILES.length} required files verified.`);
}

main();
