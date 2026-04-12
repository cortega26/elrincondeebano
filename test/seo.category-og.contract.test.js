const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

test('all category og:image URLs are absolute same-origin URLs with a deterministic version query', async () => {
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
    assert.match(
      imageUrl,
      new RegExp(
        `^https://www\\.elrincondeebano\\.com/assets/images/og/categories/${fileName.replace('.', '\\.')}(?:\\?v=[a-f0-9]{12})$`,
        'i'
      ),
      `Expected ${slug} to resolve to a versioned absolute URL`
    );
  }
});
