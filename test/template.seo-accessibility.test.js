const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

function readTemplate(relPath) {
  return fs.readFileSync(path.resolve(__dirname, '..', relPath), 'utf8');
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
