// PWA manifest injection (migrated from csp.js)
export function injectPwaManifest() {
  try {
    if (!document.querySelector('link[rel="manifest"]')) {
      const link = document.createElement('link');
      link.rel = 'manifest';
      link.href = '/app.webmanifest';
      document.head.appendChild(link);
    }
  } catch (e) {
    console.warn('[modules/pwa] injectPwaManifest error:', e);
  }
}
