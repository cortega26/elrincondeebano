const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

test('getCategoryOgImageUrl returns a stable URL (no version query) using the manifest file path', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'seo-og-'));
  const categoriesDir = path.join(tempRoot, 'assets', 'images', 'og', 'categories');
  fs.mkdirSync(categoriesDir, { recursive: true });

  const imageBytes = Buffer.from('new-cervezas-og-image');
  fs.writeFileSync(path.join(categoriesDir, 'cervezas.og_v3.jpg'), imageBytes);
  fs.writeFileSync(
    path.join(categoriesDir, '.og_manifest.json'),
    `${JSON.stringify(
      {
        items: {
          cervezas: {
            jpg: {
              file: 'cervezas.og_v3.jpg',
              sha256: 'stale-manifest-hash-should-not-win',
            },
          },
        },
      },
      null,
      2
    )}\n`
  );

  const seoModuleUrl = `${
    pathToFileURL(path.join(process.cwd(), 'astro-poc', 'src', 'lib', 'seo.ts')).href
  }?t=${Date.now()}`;
  const { getCategoryOgImageUrl } = await import(seoModuleUrl);

  const imageUrl = getCategoryOgImageUrl('cervezas', { repoRoot: tempRoot });

  assert.equal(
    imageUrl,
    'https://www.elrincondeebano.com/assets/images/og/categories/cervezas.og_v3.jpg'
  );
  assert.doesNotMatch(imageUrl, /[?&]v=/);
});
