const assert = require('assert');
const { JSDOM } = require('jsdom');

(async () => {
  const dom = new JSDOM(
    '<!DOCTYPE html><html><head>\
    <link rel="stylesheet" href="a.css" media="print" data-defer>\
    <link rel="stylesheet" href="b.css" media="print" data-defer>\
  </head><body></body></html>'
  );

  global.window = dom.window;
  global.document = dom.window.document;

  const { applyDeferredStyles } = await import('../src/js/modules/deferred-css.mjs');
  applyDeferredStyles(document);

  const links = [...document.querySelectorAll('link[rel="stylesheet"]')];
  assert.strictEqual(links.length, 2, 'two stylesheet links should exist');
  for (const l of links) {
    assert.strictEqual(l.media, 'all', 'media should be switched to all');
    assert.ok(!l.hasAttribute('data-defer'), 'data-defer should be removed');
  }

  console.log('deferredCss.swap.test.js passed');
})();
