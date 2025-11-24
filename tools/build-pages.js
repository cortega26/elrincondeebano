const fs = require('fs');
const path = require('path');
const ejs = require('ejs');

const {
  resolveFromOutput,
  ensureDir,
  rootDir,
} = require('./utils/output-dir');

const templatePath = path.join(rootDir, 'templates', 'category.ejs');
const template = fs.readFileSync(templatePath, 'utf8');

const {
  loadCategoryCatalog,
  buildCategoryPages,
  buildNavModel,
} = require('./utils/category-catalog');

const catalog = loadCategoryCatalog();
const pages = buildCategoryPages(catalog);
const navGroups = buildNavModel(catalog);
function loadManifestFonts() {
  const manifestPath = resolveFromOutput('asset-manifest.json');
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const files = Array.isArray(manifest?.files) ? manifest.files : [];
    return files.filter((file) => typeof file === 'string' && file.toLowerCase().endsWith('.woff2'));
  } catch (error) {
    console.warn('build-pages: Unable to read asset manifest for font preloads:', error);
    return [];
  }
}

const preloadFonts = loadManifestFonts();

const outputDir = resolveFromOutput('pages');
ensureDir(outputDir);

pages.forEach(page => {
  const html = ejs.render(
    template,
    {
      categoryName: page.name,
      description: page.description,
      slug: page.slug,
      navGroups,
      preloadFonts,
    },
    { filename: templatePath }
  );
  const outputPath = path.join(outputDir, `${page.slug}.html`);
  fs.writeFileSync(outputPath, html);
});
