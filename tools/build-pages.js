const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ejs = require('ejs');

const { resolveFromOutput, ensureDir, rootDir } = require('./utils/output-dir');
const {
  readProductData,
  sortAndEnrichProducts,
  mapProductForInline,
  safeJsonStringify,
} = require('./utils/product-mapper');

const templatePath = path.join(rootDir, 'templates', 'category.ejs');
const template = fs.readFileSync(templatePath, 'utf8');

const {
  loadCategoryCatalog,
  buildCategoryPages,
  buildNavModel,
} = require('./utils/category-catalog');
const { appendToManifest, readManifestFonts } = require('./utils/manifest');

const catalog = loadCategoryCatalog();
const pages = buildCategoryPages(catalog);
const navGroups = buildNavModel(catalog);
const productData = readProductData();
const enrichedProducts = sortAndEnrichProducts(productData.products || []);
const availableProducts = enrichedProducts.filter((product) => product.stock);


const manifestPath = resolveFromOutput('asset-manifest.json');
const preloadFonts = readManifestFonts(manifestPath, 'build-pages');

const outputDir = resolveFromOutput('pages');
ensureDir(outputDir);
const ogVersionCache = new Map();
const ogManifestPath = path.join(rootDir, 'assets', 'images', 'og', 'categories', '.og_manifest.json');
let ogManifest = null;

if (fs.existsSync(ogManifestPath)) {
  try {
    ogManifest = JSON.parse(fs.readFileSync(ogManifestPath, 'utf8'));
  } catch (error) {
    console.warn(`OG manifest parse failed (${ogManifestPath}): ${error.message}`);
  }
}

function getOgImageFileName(slug) {
  const candidate = ogManifest?.items?.[slug]?.jpg?.file;
  if (typeof candidate === 'string' && /^[a-z0-9_]+\.[a-z0-9_-]+\.jpg$/i.test(candidate)) {
    return candidate;
  }
  return `${slug}.jpg`;
}

function getOgImageVersion(ogImageFile, fallbackVersion) {
  if (!fs.existsSync(ogImageFile)) {
    return fallbackVersion;
  }
  if (ogVersionCache.has(ogImageFile)) {
    return ogVersionCache.get(ogImageFile);
  }
  const digest = crypto
    .createHash('sha1')
    .update(fs.readFileSync(ogImageFile))
    .digest('hex')
    .slice(0, 12);
  const version = fallbackVersion ? `${fallbackVersion}-${digest}` : digest;
  ogVersionCache.set(ogImageFile, version);
  return version;
}

pages.forEach((page) => {
  const productKey = (page.productKey || page.slug || page.name || '').toLowerCase();
  const ogImageFileName = getOgImageFileName(page.slug);
  const ogImagePath = `/assets/images/og/categories/${ogImageFileName}`;
  const fallbackOgVersion = String(catalog.version || productData.version || '').trim();
  const ogImageFile = path.join(rootDir, 'assets', 'images', 'og', 'categories', ogImageFileName);
  const ogImageVersion = encodeURIComponent(getOgImageVersion(ogImageFile, fallbackOgVersion));
  const ogImage = fs.existsSync(ogImageFile)
    ? `https://elrincondeebano.com${ogImagePath}${ogImageVersion ? `?v=${ogImageVersion}` : ''}`
    : 'https://elrincondeebano.com/assets/images/web/logo.webp';
  const categoryProducts = availableProducts.filter((product) => {
    const categoryValue = (product.category || '').toLowerCase();
    return categoryValue === productKey;
  });
  const inlinePayload = safeJsonStringify({
    version: productData.version || null,
    totalProducts: categoryProducts.length,
    initialProducts: categoryProducts.map(mapProductForInline),
  });
  const html = ejs.render(
    template,
    {
      categoryName: page.name,
      categoryKey: page.productKey,
      description: page.description,
      slug: page.slug,
      ogImage,
      navGroups,
      products: categoryProducts,
      totalProducts: categoryProducts.length,
      inlinePayload,
      preloadFonts,
    },
    { filename: templatePath }
  );
  const outputPath = path.join(outputDir, `${page.slug}.html`);
  fs.writeFileSync(outputPath, html);
  appendToManifest(manifestPath, [`/pages/${page.slug}.html`]);
});
