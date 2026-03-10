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
const HOME_CATEGORY_PRIORITY = [
  'Despensa',
  'Bebidas',
  'Aguas',
  'Lacteos',
  'SnacksSalados',
  'Limpiezayaseo',
];

function flattenCategories(navGroups = []) {
  return navGroups.flatMap((group) => (Array.isArray(group.categories) ? group.categories : []));
}

function selectHighlightedCategories(navGroups = []) {
  const categories = flattenCategories(navGroups);
  const bySlug = new Map(categories.map((category) => [String(category.slug || '').toLowerCase(), category]));
  const selected = [];
  const seen = new Set();

  HOME_CATEGORY_PRIORITY.forEach((slug) => {
    const match = bySlug.get(String(slug).toLowerCase());
    if (match && !seen.has(match.url)) {
      selected.push(match);
      seen.add(match.url);
    }
  });

  categories.forEach((category) => {
    if (selected.length >= 6 || seen.has(category.url)) return;
    selected.push(category);
    seen.add(category.url);
  });

  return selected.slice(0, 6);
}

function selectQuickPicks(products = []) {
  const selected = [];
  const seenCategories = new Set();

  HOME_CATEGORY_PRIORITY.forEach((categoryKey) => {
    const match = products.find(
      (product) => product.category === categoryKey && product.stock && !product.isDiscounted
    );
    if (match && !seenCategories.has(match.category)) {
      selected.push(match);
      seenCategories.add(match.category);
    }
  });

  products.forEach((product) => {
    if (selected.length >= 4 || !product.stock || product.isDiscounted) return;
    if (seenCategories.has(product.category)) return;
    selected.push(product);
    seenCategories.add(product.category);
  });

  return selected.slice(0, 4);
}

function selectFeaturedDeals(products = []) {
  return [...products]
    .filter((product) => product.stock && product.isDiscounted)
    .sort((a, b) => {
      if (b.discountPercent !== a.discountPercent) {
        return b.discountPercent - a.discountPercent;
      }
      return a.price - b.price;
    })
    .slice(0, 4);
}

function build() {
  const template = fs.readFileSync(TEMPLATE_PATH, 'utf8');
  const productData = readProductData();
  const preloadFonts = readManifestFonts(resolveFromOutput('asset-manifest.json'), 'build-index');
  const catalog = loadCategoryCatalog();
  const navGroups = buildNavModel(catalog);
  const sortedProducts = sortAndEnrichProducts(productData.products || []);

  const availableProducts = sortedProducts.filter((product) => product.stock);
  const highlightedCategories = selectHighlightedCategories(navGroups);
  const featuredDeals = selectFeaturedDeals(availableProducts);
  const quickPicks = selectQuickPicks(availableProducts);

  const initialProducts = availableProducts;

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
      highlightedCategories,
      featuredDeals,
      quickPicks,
      preloadFonts,
    },
    { rmWhitespace: false, filename: TEMPLATE_PATH }
  );

  ensureDir(resolveOutputDir());
  fs.writeFileSync(OUTPUT_PATH, html);
  appendToManifest(resolveFromOutput('asset-manifest.json'), ['/index.html']);
}

build();
