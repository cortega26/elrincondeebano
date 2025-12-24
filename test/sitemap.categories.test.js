const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { generateSitemap } = require('../tools/generate-sitemap.js');

test('sitemap includes enabled categories and excludes disabled ones', () => {
  const repoRoot = path.resolve(__dirname, '..');
  const catalogPath = path.join(repoRoot, 'data', 'categories.json');
  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  const enabledSlugs = (catalog.categories || [])
    .filter((category) => category && category.enabled !== false)
    .map((category) => category.slug || category.id)
    .filter(Boolean)
    .sort();

  const sitemap = generateSitemap();
  const matches = [...sitemap.matchAll(/<loc>https:\/\/elrincondeebano\.com\/pages\/([^<]+)\.html<\/loc>/g)];
  const sitemapSlugs = matches.map((m) => m[1]).sort();

  assert.deepStrictEqual(sitemapSlugs, enabledSlugs);
});
