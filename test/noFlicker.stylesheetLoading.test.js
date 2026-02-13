const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const TEMPLATE_CASES = [
  { relPath: 'templates/index.ejs', label: 'landing', stylesheetHref: '/dist/css/style.min.css?v=100' },
  {
    relPath: 'templates/category.ejs',
    label: 'category',
    stylesheetHref: '/dist/css/style.category.min.css?v=100',
  },
];

function readTemplate(relPath) {
  const absPath = path.resolve(__dirname, '..', relPath);
  return fs.readFileSync(absPath, 'utf8');
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function assertNoDeferredMainStylesheet(content, relPath, stylesheetHref) {
  const escapedHref = escapeRegex(stylesheetHref);
  const deferredByMedia = new RegExp(
    `<link[^>]*href="${escapedHref}"[^>]*\\bmedia=["']print["'][^>]*>`,
    'i'
  );
  const deferredByAttr = new RegExp(
    `<link[^>]*href="${escapedHref}"[^>]*\\bdata-defer\\b[^>]*>`,
    'i'
  );

  assert.ok(
    !deferredByMedia.test(content),
    `Main stylesheet must not use media=print defer pattern in ${relPath}`
  );
  assert.ok(
    !deferredByAttr.test(content),
    `Main stylesheet must not use data-defer in ${relPath}`
  );
}

function assertMainStylesheetPresent(content, relPath, stylesheetHref) {
  assert.ok(
    content.includes(`<link rel="stylesheet" href="${stylesheetHref}">`),
    `Main stylesheet link is missing in ${relPath}`
  );
}

test('templates keep main stylesheet render-blocking to avoid initial flicker', () => {
  for (const { relPath, label, stylesheetHref } of TEMPLATE_CASES) {
    const content = readTemplate(relPath);
    assertMainStylesheetPresent(content, `${relPath} (${label})`, stylesheetHref);
    assertNoDeferredMainStylesheet(content, `${relPath} (${label})`, stylesheetHref);
  }
});
