'use strict';

const { spawnSync } = require('node:child_process');
const path = require('node:path');

require('./setup-globals');

const tests = [
  'generateStableId.test.js',
  'serviceWorker.utils.test.js',
  'registerServiceWorker.test.js',
  'registerServiceWorker.test.js',
  'updateProductDisplay.test.js',
  'ensureDiscountToggle.test.js',
  'memoize.test.js',
  'notifications.test.js',
  'avif.sources.test.js',
  'image-pipeline.paths.test.js',
  'generate-image-variants.config.test.js',
  'sitemap.categories.test.js',
  'swCache.test.js',
  'modules.dom.test.js',
  'fetchWithRetry.test.js',
  'data-endpoint.resolver.test.js',
  'productDataVersion.normalization.test.js',
  'bootstrap.module.test.js',
  'menu-controller.test.js',
  'initApp.idempotence.test.js',
  'initAppFallback.test.js',
  'buildIndex.lcp.test.js',
  'resourceHints.integrity.test.js',
  'robots.test.js',
  'csp.connect.test.js',
  'performance.metrics.test.js',
  'snapshot.utils.test.mjs',
  'product-sync.server.test.js',
];

for (const testFile of tests) {
  const testPath = path.join(__dirname, testFile);
  const result = spawnSync(process.execPath, ['--experimental-strip-types', testPath], {
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }

  if (typeof result.status === 'number' && result.status !== 0) {
    throw new Error(`Test ${testFile} exited with code ${result.status}`);
  }
}
