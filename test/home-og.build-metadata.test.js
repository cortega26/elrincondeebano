'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

test('built homepage emits JPG og:image with explicit 1200x1200 metadata', (t) => {
  const pagePath = path.resolve(__dirname, '..', 'build', 'index.html');
  if (!fs.existsSync(pagePath)) {
    t.skip('build/index.html not found; run npm run build first');
    return;
  }

  const html = fs.readFileSync(pagePath, 'utf8');
  const imageMatch = html.match(/<meta property="og:image" content="([^"]+)"/i);
  assert.ok(imageMatch, 'Expected og:image meta tag in built homepage');
  assert.match(
    imageMatch[1],
    /\/assets\/images\/og\/home\.og\.jpg$/i,
    'Expected homepage og:image to point to the dedicated JPG social asset'
  );

  assert.ok(
    html.includes('<meta property="og:image:width" content="1200">'),
    'Expected og:image:width=1200'
  );
  assert.ok(
    html.includes('<meta property="og:image:height" content="1200">'),
    'Expected og:image:height=1200'
  );
});
