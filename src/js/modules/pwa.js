import { log } from '../utils/logger.mts';

// PWA manifest injection (migrated from csp.js)
export function injectPwaManifest() {
  try {
    if (!document.querySelector('link[rel="manifest"]')) {
      const link = document.createElement('link');
      link.rel = 'manifest';
      link.href = '/app.webmanifest';
      document.head.appendChild(link);
    }
  } catch (error) {
    log('warn', 'pwa_manifest_injection_failed', { error });
  }
}
