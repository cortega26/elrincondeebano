const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

test('all category og:image URLs use the live JPG hash for the current asset', async () => {
  const repoRoot = process.cwd();
  const manifestPath = path.join(repoRoot, 'assets', 'images', 'og', 'categories', '.og_manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const seoModuleUrl = `${pathToFileURL(
    path.join(repoRoot, 'astro-poc', 'src', 'lib', 'seo.ts')
  ).href}?t=${Date.now()}`;
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

    const expectedVersion = crypto
      .createHash('sha1')
      .update(fs.readFileSync(filePath))
      .digest('hex')
      .slice(0, 12);

    assert.equal(
      getCategoryOgImageUrl(slug, { repoRoot }),
      `https://elrincondeebano.com/assets/images/og/categories/${fileName}?v=${expectedVersion}`,
      `Expected ${slug} to use the live file hash`
    );
  }
});
