// This script writes a Content Security Policy meta tag to the page head.
// It must remain a small, synchronous script to run before modules load.

(function () {
  function generateNonce() {
    try {
      const arr = new Uint8Array(16);
      (window.crypto || window.msCrypto).getRandomValues(arr);
      let str = '';
      for (let i = 0; i < arr.length; i += 1) {
        str += String.fromCharCode(arr[i]);
      }
      return btoa(str).replace(/\+/g, '-').replace(/\//g, '_');
    } catch {
      return Math.random().toString(36).slice(2);
    }
  }

  const cspNonce = generateNonce();
  // El nonce se usa solo en este script; no se expone globalmente.
  // Los modulos que necesiten nonce deben recibirlo por parametro o usar el meta tag directamente.

  const cspPolicy = `
    default-src 'self';
    base-uri 'self';
    object-src 'none';
    frame-ancestors 'none';
    script-src 'self' https://static.cloudflareinsights.com 'sha256-SvXHAIPcJdE6zuH0y1Xb0AUS/ZJCmBwN7SfMfiEj578=';
    style-src 'self';
    img-src 'self' data: https:;
    font-src 'self' data:;
    connect-src 'self' https://cloudflareinsights.com https://static.cloudflareinsights.com;
    manifest-src 'self';
    worker-src 'self';
    form-action 'self';
    upgrade-insecure-requests;
  `
    .replace(/\s+/g, ' ')
    .trim();

  const meta = document.createElement('meta');
  meta.httpEquiv = 'Content-Security-Policy';
  meta.content = cspPolicy;
  document.head.appendChild(meta);
})();
