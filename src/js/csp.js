// This script writes a Content Security Policy meta tag to the page head.
// It must remain a small, synchronous script to run before modules load.

(function () {
  // CSP policy aligned with tools/security-header-policy.mjs.
  // Hash-based policy for consistency with Cloudflare Worker header CSP.
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
