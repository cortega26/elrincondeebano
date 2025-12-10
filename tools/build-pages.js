const fs = require('fs');
const path = require('path');
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
const { appendToManifest } = require('./utils/manifest');

const catalog = loadCategoryCatalog();
const pages = buildCategoryPages(catalog);
const navGroups = buildNavModel(catalog);
const productData = readProductData();
const enrichedProducts = sortAndEnrichProducts(productData.products || []);
const availableProducts = enrichedProducts.filter((product) => product.stock);

function loadManifestFonts() {
  const manifestPath = resolveFromOutput('asset-manifest.json');
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const files = Array.isArray(manifest?.files) ? manifest.files : [];
    return files.filter(
      (file) => typeof file === 'string' && file.toLowerCase().endsWith('.woff2')
    );
  } catch (error) {
    console.warn('build-pages: Unable to read asset manifest for font preloads:', error);
    return [];
  }
}

const preloadFonts = loadManifestFonts();
const manifestPath = resolveFromOutput('asset-manifest.json');

const outputDir = resolveFromOutput('pages');
ensureDir(outputDir);

pages.forEach((page) => {
  const productKey = (page.productKey || page.slug || page.name || '').toLowerCase();
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
      description: page.description,
      slug: page.slug,
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
