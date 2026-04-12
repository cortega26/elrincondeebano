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

function extractMetaContent(html, attributeName, attributeValue) {
  const escapedValue = attributeValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(
    `<meta[^>]+${attributeName}=["']${escapedValue}["'][^>]+content=["']([^"]+)["']`,
    'i'
  );
  return html.match(pattern)?.[1] || null;
}

function extractCanonicalHref(html) {
  return html.match(/<link\s+rel=["']canonical["'][^>]*href=["']([^"']+)["']/i)?.[1] || null;
}

function mapSitemapUrlToHtmlPath(loc) {
  const pathname = new URL(loc).pathname;
  if (pathname === '/') {
    return path.join(distRoot, 'index.html');
  }
  if (!pathname.endsWith('/')) {
    throw new Error(`Primary sitemap URL must end with a trailing slash: ${loc}`);
  }
  return path.join(distRoot, pathname.replace(/^\/+/, ''), 'index.html');
}

function mapAssetUrlToDistPath(assetUrl) {
  const parsed = new URL(assetUrl);
  if (parsed.origin !== SITE_ORIGIN) {
    throw new Error(`Share-preview asset must stay on ${SITE_ORIGIN}: ${assetUrl}`);
  }
  return path.join(distRoot, decodeURIComponent(parsed.pathname).replace(/^\/+/, ''));
}

function assertSupportedSharePreviewHtml(html, loc, label) {
  const canonical = extractCanonicalHref(html);
  const ogUrl = extractMetaContent(html, 'property', 'og:url');
  const description = extractMetaContent(html, 'name', 'description');
  const ogDescription = extractMetaContent(html, 'property', 'og:description');
  const twitterDescription = extractMetaContent(html, 'name', 'twitter:description');
  const ogTitle = extractMetaContent(html, 'property', 'og:title');
  const twitterTitle = extractMetaContent(html, 'name', 'twitter:title');
  const ogImage = extractMetaContent(html, 'property', 'og:image');
  const ogImageType = extractMetaContent(html, 'property', 'og:image:type');
  const ogImageWidth = extractMetaContent(html, 'property', 'og:image:width');
  const ogImageHeight = extractMetaContent(html, 'property', 'og:image:height');
  const twitterCard = extractMetaContent(html, 'name', 'twitter:card');

  if (!canonical || canonical !== loc) {
    throw new Error(`${label} canonical must match sitemap URL. Expected ${loc}, got ${String(canonical)}`);
  }
  if (!ogUrl || ogUrl !== canonical) {
    throw new Error(`${label} og:url must match canonical. Got ${String(ogUrl)}`);
  }
  if (!description || description !== ogDescription || description !== twitterDescription) {
    throw new Error(`${label} description, og:description, and twitter:description must be present and identical.`);
  }
  if (!ogTitle || !twitterTitle || ogTitle !== twitterTitle) {
    throw new Error(`${label} og:title and twitter:title must be present and identical.`);
  }
  if (!twitterCard || twitterCard !== 'summary_large_image') {
    throw new Error(`${label} must emit twitter:card=summary_large_image.`);
  }
  if (!ogImage || !/^https:\/\/www\.elrincondeebano\.com\/.+\.(?:jpe?g|png)(?:\?[^"]+)?$/i.test(ogImage)) {
    throw new Error(`${label} must emit an absolute same-origin JPG/PNG og:image. Got ${String(ogImage)}`);
  }
  if (ogImageType !== 'image/jpeg' && ogImageType !== 'image/png') {
    throw new Error(`${label} must emit og:image:type=image/jpeg or image/png. Got ${String(ogImageType)}`);
  }
  if (ogImageWidth !== '1200' || ogImageHeight !== '1200') {
    throw new Error(`${label} must emit og:image dimensions 1200x1200.`);
  }

  const assetPath = mapAssetUrlToDistPath(ogImage);
  if (!fs.existsSync(assetPath)) {
    throw new Error(`${label} og:image does not exist in dist: ${path.relative(distRoot, assetPath)}`);
  }
}

function ensureSupportedSharePreviewContract() {
  const sitemapContent = fs.readFileSync(path.join(distRoot, 'sitemap.xml'), 'utf8');
  const locMatches = Array.from(sitemapContent.matchAll(/<loc>([^<]+)<\/loc>/g)).map(
    (match) => match[1]
  );
  const categoryLocs = locMatches.filter((loc) => {
    const pathname = new URL(loc).pathname;
    return pathname !== '/' && !pathname.startsWith('/p/');
  });
  const productLocs = locMatches.filter((loc) => new URL(loc).pathname.startsWith('/p/'));

  if (categoryLocs.length === 0) {
    throw new Error('Share-preview contract requires at least one primary category route in sitemap.xml.');
  }
  if (productLocs.length === 0) {
    throw new Error('Share-preview contract requires at least one product route in sitemap.xml.');
  }

  for (const loc of locMatches) {
    const htmlPath = mapSitemapUrlToHtmlPath(loc);
    if (!fs.existsSync(htmlPath)) {
      throw new Error(`Primary share-preview route missing built HTML: ${path.relative(distRoot, htmlPath)}`);
    }
    const html = fs.readFileSync(htmlPath, 'utf8');
    assertSupportedSharePreviewHtml(html, loc, path.relative(distRoot, htmlPath));
  }
}

function ensureLegacySharePreviewPolicy() {
  const legacyRoutes = [
    {
      file: path.join('pages', 'bebidas.html'),
      canonical: `${SITE_ORIGIN}/bebidas/`,
    },
    {
      file: path.join('c', 'bebidas', 'index.html'),
      canonical: `${SITE_ORIGIN}/bebidas/`,
    },
  ];

  for (const route of legacyRoutes) {
    const htmlPath = path.join(distRoot, route.file);
    const html = fs.readFileSync(htmlPath, 'utf8');
    const canonical = extractCanonicalHref(html);
    const ogUrl = extractMetaContent(html, 'property', 'og:url');
    const robots = extractMetaContent(html, 'name', 'robots');
    if (canonical !== route.canonical) {
      throw new Error(`${route.file} canonical must point to the supported modern route.`);
    }
    if (ogUrl !== route.canonical) {
      throw new Error(`${route.file} og:url must point to the supported modern route.`);
    }
    if (robots !== 'noindex, follow') {
      throw new Error(`${route.file} must stay noindex, follow.`);
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
  ensureSupportedSharePreviewContract();
  ensureLegacySharePreviewPolicy();

  console.log(
    `Artifact contract validation passed: ${REQUIRED_FILES.length} required files verified.`
  );
}

main();
