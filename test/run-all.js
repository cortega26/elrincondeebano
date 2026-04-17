'use strict';

const { spawnSync } = require('node:child_process');
const path = require('node:path');

require('./setup-globals');

const tests = [
  'generateStableId.test.js',
  'serviceWorker.utils.test.js',
  'registerServiceWorker.test.js',
  'updateProductDisplay.test.js',
  'ensureDiscountToggle.test.js',
  'catalog-manager.test.js',
  'app-bootstrap.test.js',
  'app-bootstrap.category-key.test.js',
  'memoize.test.js',
  'notifications.test.js',
  'avif.sources.test.js',
  'image-pipeline.paths.test.js',
  'generate-image-variants.config.test.js',
  'sync-avif-assets.test.js',
  'sync-data.script.test.js',
  'sync-category-og-overrides.test.js',
  'category-registry.contract.test.js',
  'active-surfaces.contract.test.js',
  'product-data.contract.test.js',
  'swCache.test.js',
  'service-worker.runtime.test.js',
  'modules.dom.test.js',
  'fetchWithRetry.test.js',
  'data-endpoint.resolver.test.js',
  'productDataVersion.normalization.test.js',
  'bootstrap.module.test.js',
  'menu-controller.test.js',
  'cart.unit.test.mjs',
  'cart.render.test.js',
  'checkout.test.js',
  'product-filter.test.js',
  'initApp.idempotence.test.js',
  'initAppFallback.test.js',
  'robots.test.js',
  'category-og.build-metadata.test.js',
  'product-og.build-metadata.test.js',
  'seo.og-image-version.test.js',
  'seo.category-og.contract.test.js',
  'share-preview.build-contract.test.js',
  'csp.policy.hardening.test.js',
  'observability.metrics.test.js',
  'performance.metrics.test.js',
  'deferredCss.swap.test.js',
  'snapshot.utils.test.mjs',
  'cfimg.config.test.js',
  'intersectionObserver.fallback.test.js',
  'swCachePolicy.test.js',
  'legacy-storefront-surface.guardrail.test.js',
  'orphan-assets.guardrail.test.js',
  'smoke-evidence.script.test.js',
  'security-header-policy.test.js',
  'cloudflare-edge-security-worker.test.js',
  'post-deploy-canary.test.js',
  'share-preview-monitor.test.js',
  'post-deploy-workflow.test.js',
  'live-contract-monitor.test.js',
  'static-deploy-workflow.test.js',
  'run-cypress.test.js',
  'tools.staticServer.security.test.js',
  'vendor.anymatch.test.js',
  'product-sync.server.test.js',
  'httpServer.securityHeaders.test.js',
  'preflight.node-version.test.js',
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
