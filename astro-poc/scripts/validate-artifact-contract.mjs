import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const distRoot = path.join(projectRoot, 'dist');
const distProductDataPath = path.join(distRoot, 'data', 'product_data.json');
const SITE_ORIGIN = 'https://www.elrincondeebano.com';

const REQUIRED_FILES = [
  'index.html',
  '404.html',
  'robots.txt',
  'sitemap.xml',
  'service-worker.js',
  path.join('data', 'product_data.json'),
  'bebidas.html',
  'vinos.html',
  'offline.html',
  path.join('pages', 'offline.html'),
  path.join('pages', 'bebidas.html'),
  path.join('pages', 'vinos.html'),
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
    throw new Error(
      'Artifact contract requires at least one product in dist/data/product_data.json'
    );
  }

  const productRouteRoot = path.join(distRoot, 'p');
  if (!fs.existsSync(productRouteRoot)) {
    throw new Error('Missing product detail route root: p/');
  }

  const hasAnyProductRoute = fs
    .readdirSync(productRouteRoot, { withFileTypes: true })
    .some(
      (entry) =>
        entry.isDirectory() && fs.existsSync(path.join(productRouteRoot, entry.name, 'index.html'))
    );

  if (!hasAnyProductRoute) {
    throw new Error(
      'Artifact contract requires at least one generated product detail route under dist/p/*/index.html'
    );
  }
}

function collectFiles(root, predicate) {
  const collected = [];
  const stack = [root];

  while (stack.length > 0) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });

    for (const entry of entries) {
      const absolutePath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(absolutePath);
        continue;
      }
      if (predicate(absolutePath)) {
        collected.push(absolutePath);
      }
    }
  }

  return collected;
}

function resolveImportCandidate(fromFile, specifier) {
  const basePath = specifier.startsWith('/')
    ? path.join(distRoot, specifier.replace(/^\/+/, ''))
    : path.resolve(path.dirname(fromFile), specifier);

  const candidates = [
    basePath,
    `${basePath}.js`,
    `${basePath}.mjs`,
    path.join(basePath, 'index.js'),
    path.join(basePath, 'index.mjs'),
  ];

  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

function ensureCompiledJsImportsResolve() {
  const jsFiles = collectFiles(distRoot, (absolutePath) => absolutePath.endsWith('.js'));
  const importPattern = /(?:import\s+(?:[^'"]+?\s+from\s+)?|import\s*\()\s*['"]([^'"]+)['"]/g;

  for (const absolutePath of jsFiles) {
    const content = fs.readFileSync(absolutePath, 'utf8');
    const missingSpecifiers = [];

    for (const match of content.matchAll(importPattern)) {
      const specifier = match[1];
      if (!specifier || /^https?:\/\//.test(specifier) || specifier.startsWith('data:')) {
        continue;
      }
      if (!specifier.startsWith('.') && !specifier.startsWith('/')) {
        continue;
      }

      const resolved = resolveImportCandidate(absolutePath, specifier);
      if (!resolved) {
        missingSpecifiers.push(specifier);
      }
    }

    if (missingSpecifiers.length > 0) {
      throw new Error(
        `Compiled JS artifact has unresolved import(s) in ${path.relative(distRoot, absolutePath)}: ${missingSpecifiers.join(', ')}`
      );
    }
  }
}

function ensureServiceWorkerDoesNotReferenceLegacyContracts() {
  const serviceWorkerPath = path.join(distRoot, 'service-worker.js');
  const content = fs.readFileSync(serviceWorkerPath, 'utf8');
  const forbiddenTokens = ['/dist/', '/asset-manifest.json'];

  for (const token of forbiddenTokens) {
    if (content.includes(token)) {
      throw new Error(`Service worker still references legacy contract token: ${token}`);
    }
  }
}

function ensureOfflineFallbacksAreSanitized() {
  const offlineFiles = ['offline.html', path.join('pages', 'offline.html')];
  const forbiddenTokens = ['/dist/', 'http://www.elrincondeebano.com/', 'application/ld+json'];

  for (const relativePath of offlineFiles) {
    const content = fs.readFileSync(path.join(distRoot, relativePath), 'utf8');
    for (const token of forbiddenTokens) {
      if (content.includes(token)) {
        throw new Error(
          `Offline fallback still references forbidden token "${token}" in ${relativePath}`
        );
      }
    }
    if (!/<meta\s+name=["']robots["'][^>]*content=["'][^"']*noindex/i.test(content)) {
      throw new Error(`Offline fallback must be marked noindex: ${relativePath}`);
    }
  }
}

function ensureSitemapOnlyListsPrimaryUrls() {
  const sitemapContent = fs.readFileSync(path.join(distRoot, 'sitemap.xml'), 'utf8');
  const locMatches = Array.from(sitemapContent.matchAll(/<loc>([^<]+)<\/loc>/g)).map(
    (match) => match[1]
  );

  if (locMatches.length === 0) {
    throw new Error('Sitemap must contain at least one <loc> entry.');
  }

  for (const loc of locMatches) {
    if (!loc.startsWith(SITE_ORIGIN)) {
      throw new Error(`Sitemap URL must use ${SITE_ORIGIN}: ${loc}`);
    }
    const pathname = new URL(loc).pathname;
    if (pathname === '/offline.html' || pathname.startsWith('/pages/')) {
      throw new Error(`Sitemap must not include compatibility/offline route: ${pathname}`);
    }
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
  ensureCompiledJsImportsResolve();
  ensureServiceWorkerDoesNotReferenceLegacyContracts();
  ensureOfflineFallbacksAreSanitized();
  ensureSitemapOnlyListsPrimaryUrls();

  console.log(
    `Artifact contract validation passed: ${REQUIRED_FILES.length} required files verified.`
  );
}

main();
