const fs = require('fs');
const path = require('path');
const ejs = require('ejs');

const { rootDir, resolveOutputDir, resolveFromOutput, ensureDir } = require('./utils/output-dir');
const { loadCategoryCatalog, buildNavModel } = require('./utils/category-catalog');
const {
  readProductData,
  sortAndEnrichProducts,
  mapProductForInline,
  safeJsonStringify,
} = require('./utils/product-mapper');
const { appendToManifest, readManifestFonts } = require('./utils/manifest');

const TEMPLATE_PATH = path.join(rootDir, 'templates', 'index.ejs');
const OUTPUT_PATH = resolveFromOutput('index.html');

const INITIAL_RENDER_COUNT = 12;


function build() {
  const template = fs.readFileSync(TEMPLATE_PATH, 'utf8');
  const productData = readProductData();
  const preloadFonts = readManifestFonts(resolveFromOutput('asset-manifest.json'), 'build-index');
  const catalog = loadCategoryCatalog();
  const navGroups = buildNavModel(catalog);
  const sortedProducts = sortAndEnrichProducts(productData.products || []);

  const availableProducts = sortedProducts.filter((product) => product.stock);

  const initialProducts = availableProducts.slice(0, INITIAL_RENDER_COUNT);

  const inlinePayload = safeJsonStringify({
    version: productData.version || null,
    totalProducts: availableProducts.length,
    initialProducts: initialProducts.map(mapProductForInline),
  });

  const html = ejs.render(
    template,
    {
      products: initialProducts,
      totalProducts: availableProducts.length,
      inlinePayload,
      navGroups,
      preloadFonts,
    },
    { rmWhitespace: false, filename: TEMPLATE_PATH }
  );

  ensureDir(resolveOutputDir());
  fs.writeFileSync(OUTPUT_PATH, html);
  appendToManifest(resolveFromOutput('asset-manifest.json'), ['/index.html']);
}

build();
