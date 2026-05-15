'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

async function loadModule() {
  return import('../infra/cloudflare/waf/deploy-crawler-bypass.mjs');
}

test('crawler bypass expression covers supported share-preview HTML routes and OG assets', async () => {
  const { CRAWLER_PATTERNS, buildExpression, buildPathExpression, buildUserAgentExpression } =
    await loadModule();

  const pathExpression = buildPathExpression();
  const userAgentExpression = buildUserAgentExpression();
  const fullExpression = buildExpression();

  assert.match(pathExpression, /starts_with\(http\.request\.uri\.path, "\/assets\/images\/og\/"\)/);
  assert.match(
    pathExpression,
    /http\.request\.uri\.path matches "\^\/\(\?:\$\|p\/\[\^\/\]\+\/\?\$\|\[\^\.\/\]\+\/\?\$\)"/
  );

  for (const crawlerPattern of CRAWLER_PATTERNS) {
    assert.match(
      userAgentExpression,
      new RegExp(
        `http\\.user_agent contains "${crawlerPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`
      )
    );
  }

  assert.match(fullExpression, / and /);
  assert.match(fullExpression, /\/assets\/images\/og\//);
  assert.match(fullExpression, /p\/\[\^\/\]\+\/\?\$/);
});

test('crawler bypass path regex matches the intended public preview route families', async () => {
  const { buildPathExpression } = await loadModule();
  const pathExpression = buildPathExpression();
  const patternMatch = pathExpression.match(/matches "([^"]+)"/);

  assert.ok(patternMatch, 'Expected a route regex in the path expression');

  const routePattern = new RegExp(patternMatch[1]);

  assert.equal(routePattern.test('/'), true);
  assert.equal(routePattern.test('/bebidas/'), true);
  assert.equal(routePattern.test('/bebidas'), true);
  assert.equal(routePattern.test('/p/sku-123/'), true);
  assert.equal(routePattern.test('/p/sku-123'), true);

  assert.equal(routePattern.test('/assets/images/og/home.og.jpg'), false);
  assert.equal(routePattern.test('/pages/bebidas.html'), false);
  assert.equal(routePattern.test('/c/bebidas/'), false);
  assert.equal(routePattern.test('/assets/app.js'), false);
});
