/**
 * Default options for product thumbnail transformations.
 * @type {Record<string, string|number>}
 */
export const CFIMG_THUMB = { fit: 'cover', quality: 75, format: 'auto', dpr: 1 };

function shouldDisableCfRewrite() {
  try {
    if (typeof process !== 'undefined' && process.env) {
      const disable = process.env.CFIMG_DISABLE;
      if (typeof disable === 'string' && ['1', 'true', 'yes'].includes(disable.toLowerCase())) {
        return true;
      }
      const enable = process.env.CFIMG_ENABLE;
      if (typeof enable === 'string' && ['1', 'true', 'yes'].includes(enable.toLowerCase())) {
        return false;
      }
    }

    if (typeof window !== 'undefined') {
      if (window.__CFIMG_DISABLE__ === true) return true;
      const enable = window.__CFIMG_ENABLE__;
      if (enable === true) return false;
      const host = window.location?.hostname;
      if (!host || host === 'localhost' || host === '127.0.0.1') return true;
      if (window.location?.protocol === 'file:') return true;
    }
  } catch (_) {
    // Fall through to enabling rewrite
  }
  // Default: disable unless explicitly enabled
  return true;
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
    return normalized.split('/').map(encodeURIComponent).join('/');
  }
  const params = Object.entries(opts)
    .map(([k, v]) => `${k}=${v}`)
    .join(',');
  const encoded = normalized.split('/').map(encodeURIComponent).join('/');
  return `/cdn-cgi/image/${params}${encoded}`;
}
