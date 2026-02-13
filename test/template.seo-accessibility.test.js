const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const ejs = require('ejs');

function readTemplate(relPath) {
  return fs.readFileSync(path.resolve(__dirname, '..', relPath), 'utf8');
}

function renderIndexTemplate() {
  const templatePath = path.resolve(__dirname, '..', 'templates', 'index.ejs');
  const template = fs.readFileSync(templatePath, 'utf8');
  return ejs.render(
    template,
    {
      products: [],
      totalProducts: 0,
      inlinePayload: '{"version":null,"totalProducts":0,"initialProducts":[]}',
      navGroups: [],
      preloadFonts: [],
    },
    { filename: templatePath }
  );
}

test('category template keeps skip link and category-specific OG URL', () => {
  const categoryTemplate = readTemplate('templates/category.ejs');

  assert.ok(
    categoryTemplate.includes('<a href="#main-content" class="skip-link">Saltar al contenido principal</a>'),
    'category template should include skip link for keyboard users'
  );

  assert.ok(
    categoryTemplate.includes(
      '<meta property="og:url" content="https://elrincondeebano.com/pages/<%= slug %>.html">'
    ),
    'category template should expose category-specific OG URL'
  );
});

test('templates include social card metadata and consistent select styling', () => {
  const indexTemplate = readTemplate('templates/index.ejs');
  const categoryTemplate = readTemplate('templates/category.ejs');

  assert.ok(
    indexTemplate.includes('<meta name="twitter:card" content="summary_large_image">'),
    'index template should include twitter card metadata'
  );
  assert.ok(
    categoryTemplate.includes('<meta name="twitter:card" content="summary_large_image">'),
    'category template should include twitter card metadata'
  );
  assert.ok(
    indexTemplate.includes('<meta property="og:site_name" content="El Rincón de Ébano">'),
    'index template should include og:site_name metadata'
  );
  assert.ok(
    categoryTemplate.includes('<meta property="og:site_name" content="El Rincón de Ébano">'),
    'category template should include og:site_name metadata'
  );

  assert.ok(
    categoryTemplate.includes('<select id="sort-options" class="form-select" aria-label="Ordenar productos">'),
    'category sort select should use form-select class for UI consistency'
  );
});

test('homepage template enforces a single canonical SEO metadata contract', () => {
  const html = renderIndexTemplate();

  const titleMatch = html.match(/<title>([^<]+)<\/title>/);
  assert.equal(titleMatch?.[1], 'El Rincón de Ébano');

  const canonicalMatch = html.match(/<link rel="canonical" href="([^"]+)">/);
  assert.equal(canonicalMatch?.[1], 'https://elrincondeebano.com/');

  const descriptionMatch = html.match(/<meta name="description" content="([^"]+)">/);
  assert.equal(descriptionMatch?.[1], 'Un minimarket en la puerta de tu departamento');

  assert.equal(
    (html.match(/<link rel="canonical" /g) || []).length,
    1,
    'homepage should define exactly one canonical link'
  );
  assert.equal(
    (html.match(/<meta property="og:title" /g) || []).length,
    1,
    'homepage should define exactly one og:title tag'
  );
  assert.equal(
    (html.match(/<meta property="og:description" /g) || []).length,
    1,
    'homepage should define exactly one og:description tag'
  );
  assert.equal(
    (html.match(/<meta property="og:image" /g) || []).length,
    1,
    'homepage should define exactly one og:image tag'
  );

  const ogImageMatch = html.match(/<meta property="og:image" content="([^"]+)">/);
  assert.equal(ogImageMatch?.[1], 'https://elrincondeebano.com/assets/images/web/logo.webp');
  assert.ok(
    html.includes('<meta property="og:image:width" content="1200">'),
    'homepage should expose og:image:width=1200'
  );
  assert.ok(
    html.includes('<meta property="og:image:height" content="1200">'),
    'homepage should expose og:image:height=1200'
  );

  const ogUrlMatch = html.match(/<meta property="og:url" content="([^"]+)">/);
  assert.equal(ogUrlMatch?.[1], canonicalMatch?.[1]);

  const twitterImageMatch = html.match(/<meta name="twitter:image" content="([^"]+)">/);
  assert.equal(twitterImageMatch?.[1], ogImageMatch?.[1]);
});

test('navbar template exposes cart badge live region for assistive tech', () => {
  const navbarTemplate = readTemplate('templates/partials/navbar.ejs');
  assert.ok(
    navbarTemplate.includes('id="cart-count"'),
    'navbar template should include cart-count badge'
  );
  assert.ok(
    navbarTemplate.includes('aria-live="polite"'),
    'cart-count badge should announce updates politely'
  );
  assert.ok(
    navbarTemplate.includes('aria-atomic="true"'),
    'cart-count badge should announce complete value changes'
  );
});
