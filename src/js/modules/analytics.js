const MEASUREMENT_ID = 'G-H0YG3RTJVM';

function initializeAnalytics() {
  if (typeof window === 'undefined') return;

  const globalWindow = window;
  const dataLayer = globalWindow.dataLayer || [];
  globalWindow.dataLayer = dataLayer;

  if (typeof globalWindow.gtag !== 'function') {
    const gtag = function gtag() {
      dataLayer.push(arguments);
    };
    globalWindow.gtag = gtag;
  }

  globalWindow.gtag('js', new Date());
  globalWindow.gtag('config', MEASUREMENT_ID);
}

export { initializeAnalytics };
