// ESM entry point to compose site enhancements and core app

import { injectEnhancementStyles } from './modules/enhancements.js';
import { setupNavigationAccessibility } from './modules/a11y.js';
import { setupPerformanceOptimizations } from './modules/perf.js';
import { injectSeoMetadata, injectStructuredData } from './modules/seo.js';
import { injectPwaManifest } from './modules/pwa.js';
import { setupCheckoutProgress } from './modules/checkout.js';
import { initializeBootstrapUI } from './modules/bootstrap.mjs';
import { initializeAnalytics } from './modules/analytics.mjs';

// Import the core app for side effects when bundling.
// Note: When bundling via esbuild, this pulls in the main application logic.
import './script.mjs';

initializeAnalytics();

function initEnhancementsOnce() {
  const root = document.documentElement;
  // Always enable deferred styles first (idempotent)
  try {
    document
      .querySelectorAll('link[rel="stylesheet"][media="print"][data-defer]')
      .forEach((link) => {
        link.media = 'all';
        link.removeAttribute('data-defer');
      });
  } catch {}

  if (root.dataset.enhancementsInit === '1') return;
  root.dataset.enhancementsInit = '1';

  injectEnhancementStyles();
  setupCheckoutProgress();
  setupNavigationAccessibility();
  setupPerformanceOptimizations();
  injectSeoMetadata();
  injectStructuredData();
  injectPwaManifest();
  initializeBootstrapUI();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initEnhancementsOnce);
} else {
  initEnhancementsOnce();
}
