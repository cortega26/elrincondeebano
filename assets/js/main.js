// ESM entry point to compose site enhancements and core app

import { injectEnhancementStyles } from './modules/enhancements.js';
import { setupNavigationAccessibility } from './modules/a11y.js';
import { setupPerformanceOptimizations } from './modules/perf.js';
import { injectSeoMetadata, injectStructuredData } from './modules/seo.js';
import { injectPwaManifest } from './modules/pwa.js';
import { setupCheckoutProgress } from './modules/checkout.js';

// Import the core app for side effects when bundling.
// Note: When bundling via esbuild, this pulls in the main application logic.
import './script.js';

function initEnhancementsOnce() {
  const root = document.documentElement;
  if (root.dataset.enhancementsInit === '1') return;
  root.dataset.enhancementsInit = '1';

  injectEnhancementStyles();
  setupCheckoutProgress();
  setupNavigationAccessibility();
  setupPerformanceOptimizations();
  injectSeoMetadata();
  injectStructuredData();
  injectPwaManifest();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initEnhancementsOnce);
} else {
  initEnhancementsOnce();
}

