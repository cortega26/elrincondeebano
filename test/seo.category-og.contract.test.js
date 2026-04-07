const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

test('all category og:image URLs are stable absolute URLs without a version query', async () => {
  const repoRoot = process.cwd();
  const manifestPath = path.join(
    repoRoot,
    'assets',
    'images',
    'og',
    'categories',
    '.og_manifest.json'
  );
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const seoModuleUrl = `${
    pathToFileURL(path.join(repoRoot, 'astro-poc', 'src', 'lib', 'seo.ts')).href
  }?t=${Date.now()}`;
  const { getCategoryOgImageUrl } = await import(seoModuleUrl);

  for (const [slug, item] of Object.entries(manifest.items || {})) {
    const fileName = item?.jpg?.file;
    if (!fileName) {
      continue;
    }

    const filePath = path.join(repoRoot, 'assets', 'images', 'og', 'categories', fileName);
    if (!fs.existsSync(filePath)) {
      continue;
    }

    const imageUrl = getCategoryOgImageUrl(slug, { repoRoot });
    assert.equal(
      imageUrl,
      `https://www.elrincondeebano.com/assets/images/og/categories/${fileName}`,
      `Expected ${slug} to have a stable URL without version query`
    );
    assert.doesNotMatch(imageUrl, /[?&]v=/, `Expected ${slug} URL to have no version query`);
  }
});
