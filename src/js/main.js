// ESM entry point to compose site enhancements and core app

import { injectEnhancementStyles } from './modules/enhancements.js';
import { setupNavigationAccessibility, setupCartOffcanvasAccessibility } from './modules/a11y.js';
import { setupPerformanceOptimizations } from './modules/perf.js';
import { injectSeoMetadata, injectStructuredData } from './modules/seo.js';
import { injectPwaManifest } from './modules/pwa.js';
import { setupCheckoutProgress } from './modules/checkout.mjs';
import { initializeBootstrapUI } from './modules/bootstrap.mjs';
import { applyDeferredStyles } from './modules/deferred-css.mjs';

// Import the core app for side effects when bundling.
// Note: When bundling via esbuild, this pulls in the main application logic.
import './script.mjs';

function initEnhancementsOnce() {
  const root = document.documentElement;
  // Always enable deferred styles first (idempotent)
  try {
    applyDeferredStyles(document);
  } catch (error) {
    // Ignore DOM access failures in non-browser or test environments.
  }

  if (root.dataset.enhancementsInit === '1') return;
  root.dataset.enhancementsInit = '1';

  injectEnhancementStyles();
  setupCheckoutProgress();
  setupNavigationAccessibility();
  setupCartOffcanvasAccessibility();
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

// Test hook: expose the initializer to allow unit tests to verify
// the deferred CSS swap logic and one-time initialization behavior.
// This export has no effect on runtime behavior.
export { initEnhancementsOnce as __initEnhancementsOnceForTest };

// Optional analytics (fully opt-in via global flag to avoid any startup cost)
try {
  if (typeof window !== 'undefined' && window.__ANALYTICS_ENABLE__ === true) {
    import('./modules/analytics.mjs')
      .then((m) => {
        m.initAnalytics({ enabled: true, consentRequired: true, sampleRate: 1.0 });
        window.__analyticsTrack = (name, props) => {
          try {
            return m.track(name, props);
          } catch {
            return false;
          }
        };
        m.track('page_view', { path: location.pathname });
      })
      .catch(() => {
        // Ignore analytics load failures.
      });
  }
} catch (error) {
  // Ignore analytics setup failures.
}
