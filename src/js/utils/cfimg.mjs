/**
 * Default options for product thumbnail transformations.
 * @type {Record<string, string|number>}
 */
export const CFIMG_THUMB = { fit: 'cover', quality: 75, format: 'auto' };

function shouldDisableCfRewrite() {
  try {
    if (typeof window !== 'undefined') {
      if (window.__CFIMG_DISABLE__ === true) return true;
      const host = window.location?.hostname;
      if (!host || host === 'localhost' || host === '127.0.0.1') return true;
      if (window.location?.protocol === 'file:') return true;
    }
    if (typeof process !== 'undefined' && process.env && process.env.CFIMG_DISABLE) {
      const raw = String(process.env.CFIMG_DISABLE).toLowerCase();
      if (raw === '1' || raw === 'true' || raw === 'yes') return true;
    }
  } catch (_) {
    // Fall through to enabling rewrite
  }
  return false;
}

/**
 * Build a Cloudflare image URL with optional transformation parameters.
 * Falls back to the raw path when Cloudflare is not available (local builds/GitHub Pages).
 * @param {string} path - Image path, absolute or relative.
 * @param {Record<string, string|number>} [opts] - Key/value pairs passed to the CDN.
 * @returns {string} The rewritten or raw URL.
 */
export function cfimg(path, opts = {}) {
  const normalized = path.startsWith('/') ? path : '/' + path;
  if (shouldDisableCfRewrite()) {
    return normalized;
  }
  const params = Object.entries(opts).map(([k, v]) => `${k}=${v}`).join(',');
  const encoded = normalized.split('/').map(encodeURIComponent).join('/');
  return `/cdn-cgi/image/${params}${encoded}`;
}
