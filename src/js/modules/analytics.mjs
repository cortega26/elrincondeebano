const MEASUREMENT_ID = 'G-H0YG3RTJVM';
const GTAG_SRC = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`;

let hasInitialized = false;
let scriptRequested = false;
let loadPromise = null;

function ensureDataLayer(globalWindow) {
  const existingDataLayer = Array.isArray(globalWindow.dataLayer) ? globalWindow.dataLayer : [];
  const dataLayer = existingDataLayer;
  globalWindow.dataLayer = dataLayer;

  if (typeof globalWindow.gtag !== 'function') {
    const gtag = function gtag() {
      dataLayer.push(arguments);
    };
    globalWindow.gtag = gtag;
  }

  return { gtag: globalWindow.gtag, dataLayer };
}

function hasCommand(dataLayer, command) {
  return Array.isArray(dataLayer) && dataLayer.some((entry) => Array.isArray(entry) && entry[0] === command);
}

function hasConfigForMeasurement(dataLayer) {
  return Array.isArray(dataLayer) && dataLayer.some((entry) => (
    Array.isArray(entry) && entry[0] === 'config' && entry[1] === MEASUREMENT_ID
  ));
}

function queueInitialConfig(globalWindow) {
  if (globalWindow.__gtagInitialised) return;

  const { dataLayer } = globalWindow;
  const hasJsCommand = hasCommand(dataLayer, 'js');
  const hasConfigCommand = hasConfigForMeasurement(dataLayer);

  if (!hasJsCommand) {
    globalWindow.gtag('js', new Date());
  }

  if (!hasConfigCommand) {
    globalWindow.gtag('config', MEASUREMENT_ID, {
      send_page_view: true,
      transport_type: 'beacon'
    });
  }

  globalWindow.__gtagInitialised = true;
}

function loadGtagScript(globalWindow) {
  if (scriptRequested && loadPromise) {
    return loadPromise;
  }

  scriptRequested = true;

  loadPromise = new Promise((resolve, reject) => {
    const { document } = globalWindow;
    if (!document || typeof document.createElement !== 'function') {
      resolve(null);
      return;
    }

    const existingScript = document.querySelector(`script[src^="${GTAG_SRC}"]`);
    if (existingScript) {
      if (existingScript.dataset.loaded === 'true') {
        resolve(existingScript);
        return;
      }
      existingScript.addEventListener('load', () => {
        existingScript.dataset.loaded = 'true';
        resolve(existingScript);
      }, { once: true });
      existingScript.addEventListener('error', reject, { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = GTAG_SRC;
    script.async = true;

    if (globalWindow.__CSP_NONCE__) {
      script.nonce = globalWindow.__CSP_NONCE__;
    }

    script.addEventListener('load', () => {
      script.dataset.loaded = 'true';
      resolve(script);
    }, { once: true });

    script.addEventListener('error', (error) => {
      scriptRequested = false;
      reject(error);
    }, { once: true });

    document.head.appendChild(script);
  });

  loadPromise.catch((error) => {
    if (typeof console !== 'undefined' && console.error) {
      console.error('Failed to load Google Analytics script', error);
    }
  });

  return loadPromise;
}

function attachDeferredLoadHandlers(globalWindow) {
  const triggerLoad = () => {
    loadGtagScript(globalWindow);
  };

  const onceOptions = { once: true, passive: true };
  const interactionEvents = ['pointerdown', 'touchstart', 'keydown', 'mousemove'];

  interactionEvents.forEach((eventName) => {
    globalWindow.addEventListener(eventName, triggerLoad, onceOptions);
  });

  globalWindow.addEventListener('scroll', triggerLoad, { once: true, passive: true });

  globalWindow.addEventListener('visibilitychange', () => {
    if (globalWindow.document.visibilityState === 'hidden') {
      triggerLoad();
    }
  }, { once: true });

  const deferredLoad = () => {
    triggerLoad();
  };

  if (typeof globalWindow.requestIdleCallback === 'function') {
    globalWindow.requestIdleCallback(deferredLoad, { timeout: 4000 });
  } else {
    globalWindow.setTimeout(deferredLoad, 4000);
  }
}

function initializeAnalytics() {
  if (typeof window === 'undefined') return;

  const globalWindow = window;

  ensureDataLayer(globalWindow);
  queueInitialConfig(globalWindow);

  if (hasInitialized) {
    loadGtagScript(globalWindow);
    return;
  }

  hasInitialized = true;

  loadGtagScript(globalWindow);
  attachDeferredLoadHandlers(globalWindow);
}

export { initializeAnalytics };
