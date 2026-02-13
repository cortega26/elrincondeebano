// ESM entry point to compose site enhancements and core app

import { setupNavigationAccessibility, setupCartOffcanvasAccessibility } from './modules/a11y.js';
import { setupCheckoutProgress } from './modules/checkout.mjs';
import { initializeBootstrapUI } from './modules/bootstrap.mjs';
import { applyDeferredStyles } from './modules/deferred-css.mjs';

const APP_RUNTIME_INTENT_SELECTOR = [
  '.add-to-cart-btn',
  '.quantity-btn',
  '.quantity-input',
  '#sort-options',
  '#filter-keyword',
  '#filter-discount',
  '#cart-icon',
  '#checkout-btn',
  '#submit-cart',
  '#catalog-load-more',
].join(',');

const APP_RUNTIME_IDLE_FALLBACK_MS = 10000;
let appRuntimePromise = null;
let appRuntimeReady = false;

function runWhenIdle(task, timeoutMs = 2000) {
  if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(() => task(), { timeout: timeoutMs });
    return;
  }
  setTimeout(task, 0);
}

function initNonCriticalEnhancements() {
  runWhenIdle(() => {
    import('./modules/enhancements.js')
      .then((m) => {
        m.injectEnhancementStyles();
      })
      .catch(() => {
        // Ignore optional enhancement failures.
      });
  });

  runWhenIdle(() => {
    import('./modules/perf.js')
      .then((m) => {
        m.setupPerformanceOptimizations();
      })
      .catch(() => {
        // Ignore optional performance hook failures.
      });
  });

  runWhenIdle(() => {
    import('./modules/pwa.js')
      .then((m) => {
        m.injectPwaManifest();
      })
      .catch(() => {
        // Ignore PWA hint failures.
      });
  });

  runWhenIdle(() => {
    import('./modules/seo.js')
      .then((m) => {
        m.injectSeoMetadata();
        m.injectStructuredData();
      })
      .catch(() => {
        // Ignore non-critical SEO injection failures.
      });
  }, 4000);

  runWhenIdle(() => {
    import('./modules/observability.mjs')
      .then((m) => {
        m.initObservability({ enabled: true, slowEndpointMs: 1200 });
      })
      .catch(() => {
        // Ignore observability bootstrap failures.
      });
  }, 3000);
}

function getIntentTarget(target) {
  if (!target || typeof target !== 'object') {
    return null;
  }

  const elementTarget =
    typeof Element !== 'undefined' && target instanceof Element ? target : target.parentElement;

  if (!elementTarget || typeof elementTarget.closest !== 'function') {
    return null;
  }

  return elementTarget.closest(APP_RUNTIME_INTENT_SELECTOR);
}

async function ensureAppRuntimeLoaded() {
  if (appRuntimePromise) {
    return appRuntimePromise;
  }

  appRuntimePromise = import('./script.mjs')
    .then(async (module) => {
      if (typeof module.initApp === 'function') {
        await module.initApp();
      }
      appRuntimeReady = true;
      return module;
    })
    .catch((error) => {
      appRuntimePromise = null;
      throw error;
    });

  return appRuntimePromise;
}

function setupAppRuntimeBootTriggers() {
  if (typeof document === 'undefined') {
    return;
  }

  let detached = false;
  let clickReplayInProgress = false;
  let catalogObserver = null;

  const detachListeners = () => {
    if (detached) {
      return;
    }
    detached = true;
    document.removeEventListener('pointerdown', onPointerIntent, true);
    document.removeEventListener('focusin', onFocusIntent, true);
    document.removeEventListener('keydown', onKeyIntent, true);
    document.removeEventListener('click', onClickCapture, true);
    if (catalogObserver) {
      catalogObserver.disconnect();
      catalogObserver = null;
    }
  };

  const triggerRuntimeLoad = () =>
    ensureAppRuntimeLoaded()
      .then(() => {
        detachListeners();
      })
      .catch(() => {
        // Ignore runtime bootstrap failures and keep current page state usable.
      });

  const onPointerIntent = (event) => {
    if (!getIntentTarget(event.target)) {
      return;
    }
    void triggerRuntimeLoad();
  };

  const onFocusIntent = (event) => {
    if (!getIntentTarget(event.target)) {
      return;
    }
    void triggerRuntimeLoad();
  };

  const onKeyIntent = (event) => {
    const key = event?.key;
    if (key !== 'Enter' && key !== ' ') {
      return;
    }
    if (!getIntentTarget(event.target)) {
      return;
    }
    void triggerRuntimeLoad();
  };

  const onClickCapture = (event) => {
    if (appRuntimeReady || clickReplayInProgress) {
      return;
    }
    const intentTarget = getIntentTarget(event.target);
    if (!intentTarget) {
      return;
    }

    event.preventDefault();
    if (typeof event.stopImmediatePropagation === 'function') {
      event.stopImmediatePropagation();
    }
    event.stopPropagation();

    clickReplayInProgress = true;
    void triggerRuntimeLoad()
      .then(() => {
        if (!appRuntimeReady || typeof MouseEvent === 'undefined') {
          return;
        }
        intentTarget.dispatchEvent(
          new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            composed: true,
          })
        );
      })
      .finally(() => {
        clickReplayInProgress = false;
      });
  };

  document.addEventListener('pointerdown', onPointerIntent, true);
  document.addEventListener('focusin', onFocusIntent, true);
  document.addEventListener('keydown', onKeyIntent, true);
  document.addEventListener('click', onClickCapture, true);

  const catalogContainer = document.getElementById('product-container');
  if (
    catalogContainer &&
    typeof window !== 'undefined' &&
    typeof window.IntersectionObserver === 'function'
  ) {
    catalogObserver = new window.IntersectionObserver(
      (entries) => {
        const isVisible = entries.some((entry) => entry.isIntersecting);
        if (!isVisible) {
          return;
        }
        void triggerRuntimeLoad();
      },
      { rootMargin: '200px' }
    );
    catalogObserver.observe(catalogContainer);
  } else if (catalogContainer) {
    runWhenIdle(() => {
      void triggerRuntimeLoad();
    }, 6000);
  }

  runWhenIdle(() => {
    void triggerRuntimeLoad();
  }, APP_RUNTIME_IDLE_FALLBACK_MS);
}

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

  setupCheckoutProgress();
  setupNavigationAccessibility();
  setupCartOffcanvasAccessibility();
  initializeBootstrapUI();
  setupAppRuntimeBootTriggers();
  initNonCriticalEnhancements();
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
