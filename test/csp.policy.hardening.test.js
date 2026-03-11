'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const DIST_CASES = [
  {
    relPath: path.join('astro-poc', 'dist', 'index.html'),
    label: 'homepage',
    canonical: 'https://www.elrincondeebano.com/',
    robots: null,
  },
  {
    relPath: path.join('astro-poc', 'dist', 'c', 'bebidas', 'index.html'),
    label: 'modern category page',
    canonical: 'https://www.elrincondeebano.com/c/bebidas/',
    robots: null,
  },
  {
    relPath: path.join('astro-poc', 'dist', 'pages', 'bebidas.html'),
    label: 'legacy compatibility category page',
    canonical: 'https://www.elrincondeebano.com/c/bebidas/',
    robots: 'noindex, follow',
  },
];

function readDistFile(relPath, t) {
  const filePath = path.join(ROOT, relPath);
  if (!fs.existsSync(filePath)) {
    t.skip(`${relPath} not found; run npm run build first`);
    return null;
  }
  return fs.readFileSync(filePath, 'utf8');
}

function getScriptTags(html) {
  return [...html.matchAll(/<script\b[^>]*>/gi)].map((match) => match[0]);
}

function getCanonicalUrl(html) {
  return html.match(/<link rel="canonical" href="([^"]+)"/i)?.[1] || null;
}

function getRobotsMeta(html) {
  return html.match(/<meta name="robots" content="([^"]+)"/i)?.[1] || null;
}

function getInlineExecutableScripts(html) {
  return [
    ...html.matchAll(
      /<script\b(?![^>]*\bsrc=)(?![^>]*type=["']application\/ld\+json["'])[^>]*>/gi
    ),
  ];
}

test('Astro storefront output keeps the executable script surface minimal', (t) => {
  for (const distCase of DIST_CASES) {
    const html = readDistFile(distCase.relPath, t);
    if (!html) {
      return;
    }

    const scriptTags = getScriptTags(html);
    assert.equal(scriptTags.length, 2, `${distCase.label} should emit exactly two script tags`);
    assert.ok(
      scriptTags.some((tag) => /bootstrap\.bundle\.min\.js/i.test(tag) && /\bdefer\b/i.test(tag)),
      `${distCase.label} should keep the deferred Bootstrap bundle`
    );
    assert.ok(
      scriptTags.some((tag) => /type="module"/i.test(tag) && /\/_astro\/.+\.js/i.test(tag)),
      `${distCase.label} should keep a single Astro module entrypoint`
    );
    assert.equal(
      getInlineExecutableScripts(html).length,
      0,
      `${distCase.label} should not emit inline executable scripts`
    );
    assert.ok(!/csp\.js/i.test(html), `${distCase.label} must not depend on legacy csp.js`);
  }
});

test('Astro storefront output keeps canonical and robots policy aligned to the modern route family', (t) => {
  for (const distCase of DIST_CASES) {
    const html = readDistFile(distCase.relPath, t);
    if (!html) {
      return;
    }

    assert.equal(
      getCanonicalUrl(html),
      distCase.canonical,
      `${distCase.label} canonical should match the modern public authority`
    );
    assert.equal(
      getRobotsMeta(html),
      distCase.robots,
      `${distCase.label} robots policy should match the route contract`
    );
  }
});
