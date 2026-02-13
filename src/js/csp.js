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
  try {
    window.__CSP_NONCE__ = cspNonce;
  } catch (error) {
    // Ignore if the CSP nonce cannot be attached to window.
  }

  const cspPolicy = `
        default-src 'self';
        script-src 'self' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://static.cloudflareinsights.com 'nonce-${cspNonce}';
        style-src 'self' https://cdn.jsdelivr.net https://fonts.googleapis.com 'nonce-${cspNonce}';
        img-src 'self' data: https:;
        font-src 'self' https://fonts.gstatic.com https://cdn.jsdelivr.net;
        connect-src 'self' https://cloudflareinsights.com https://cdn.jsdelivr.net;
        frame-src 'none';
        object-src 'none';
        base-uri 'self';
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
