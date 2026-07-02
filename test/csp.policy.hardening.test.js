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
    relPath: path.join('astro-poc', 'dist', 'bebidas', 'index.html'),
    label: 'modern category page',
    canonical: 'https://www.elrincondeebano.com/bebidas/',
    robots: null,
  },
  {
    relPath: path.join('astro-poc', 'dist', 'pages', 'bebidas.html'),
    label: 'legacy compatibility category page',
    canonical: 'https://www.elrincondeebano.com/bebidas/',
    robots: 'noindex, follow',
  },
  {
    relPath: path.join('astro-poc', 'dist', 'c', 'bebidas', 'index.html'),
    label: 'compatibility category page',
    canonical: 'https://www.elrincondeebano.com/bebidas/',
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

function getExecutableScriptTags(html) {
  return getScriptTags(html).filter(
    (tag) =>
      !/\btype=["']application\/(?:json|ld\+json)["']/i.test(tag) &&
      !/\btype=["']text\/partytown(?:-x)?["']/i.test(tag)
  );
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
      /<script\b(?![^>]*\bsrc=)(?![^>]*type=["']application\/(?:ld\+json|json)["'])[^>]*>/gi
    ),
  ];
}

test('Astro storefront output keeps the executable script surface minimal', (t) => {
  for (const distCase of DIST_CASES) {
    const html = readDistFile(distCase.relPath, t);
    if (!html) {
      return;
    }

    const scriptTags = getExecutableScriptTags(html);
    // El baseline actual: 1-2 módulos Astro + 1 inline de Partytown (setup del worker).
    // Partytown requiere un snippet inline mínimo para arrancar el web worker.
    // Pagefind se carga como módulo externo (no inline).
    assert.ok(
      scriptTags.length >= 1 && scriptTags.length <= 5,
      `${distCase.label} should emit a reasonable number of executable script tags (got ${scriptTags.length})`
    );
    assert.ok(
      scriptTags.some((tag) => /type="module"/i.test(tag) && /\/_astro\/.+\.js/i.test(tag)),
      `${distCase.label} should keep at least one self-hosted Astro module entrypoint`
    );

    // Partytown requiere un snippet inline para arrancar el web worker.
    // Cualquier otro script inline ejecutable debe justificarse.
    const inlineExec = getInlineExecutableScripts(html);
    const nonPartytownInline = inlineExec.filter((match) => {
      const start = Math.max(0, match.index - 10);
      const end = Math.min(html.length, match.index + 300);
      const surrounding = html.substring(start, end);
      return !/\/~partytown\//.test(surrounding);
    });
    assert.equal(
      nonPartytownInline.length,
      0,
      `${distCase.label} should not emit inline executable scripts beyond Partytown setup (got ${nonPartytownInline.length})`
    );
    assert.ok(
      !/cdn\.jsdelivr\.net/i.test(html),
      `${distCase.label} should not depend on jsDelivr for executable assets`
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
