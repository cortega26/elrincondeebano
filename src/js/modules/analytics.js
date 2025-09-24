const MEASUREMENT_ID = 'G-H0YG3RTJVM';
const GTAG_SRC = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`;

let bootstrapped = false;

function bootstrapDataLayer(globalWindow) {
  const dataLayer = globalWindow.dataLayer || [];
  globalWindow.dataLayer = dataLayer;

  if (typeof globalWindow.gtag !== 'function') {
    const gtag = function gtag() {
      dataLayer.push(arguments);
    };
    globalWindow.gtag = gtag;
  }

  return globalWindow.gtag;
}

function loadGtagScript(globalWindow) {
  const { document: doc } = globalWindow;
  if (!doc) return null;

  const existing = doc.querySelector(`script[src^="${GTAG_SRC}"]`);
  if (existing) {
    return existing;
  }

  const script = doc.createElement('script');
  script.async = true;
  script.src = GTAG_SRC;
  script.dataset.analytics = 'gtag';

  if (globalWindow.__CSP_NONCE__) {
    script.setAttribute('nonce', globalWindow.__CSP_NONCE__);
  }

  doc.head.appendChild(script);
  return script;
}

function dispatchInitialConfig(gtag) {
  gtag('js', new Date());
  gtag('config', MEASUREMENT_ID);
}

function initializeAnalytics() {
  if (typeof window === 'undefined') return;
  if (bootstrapped) return;
  bootstrapped = true;

  const globalWindow = window;
  const gtag = bootstrapDataLayer(globalWindow);
  const script = loadGtagScript(globalWindow);

  let initialConfigSent = false;
  const sendConfigOnce = () => {
    if (initialConfigSent) return;
    initialConfigSent = true;
    try {
      dispatchInitialConfig(gtag);
    } catch (error) {
      if (globalWindow?.console?.error) {
        console.error('Error inicializando Google Analytics', error);
      }
    }
  };

  if (script) {
    script.addEventListener('load', sendConfigOnce, { once: true });
    script.addEventListener('error', (event) => {
      if (globalWindow?.console?.error) {
        console.error('Error cargando gtag.js', event);
      }
    }, { once: true });
  }

  // Dispara la configuración inmediatamente para garantizar que el evento se
  // encole en dataLayer, incluso si el script aún no terminó de cargar.
  sendConfigOnce();
}

export { initializeAnalytics, bootstrapDataLayer, loadGtagScript };
