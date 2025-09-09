/**
 * Build a Cloudflare image URL with optional transformation parameters.
 * @param {string} path - Image path, absolute or relative.
 * @param {Record<string, string|number>} [opts] - Key/value pairs passed to the CDN.
 * @returns {string} The rewritten URL.
 */
export function cfimg(path, opts = {}) {
  const p = path.startsWith('/') ? path : '/' + path;
  const params = Object.entries(opts).map(([k, v]) => `${k}=${v}`).join(',');
  const encoded = p.split('/').map(encodeURIComponent).join('/');
  return `/cdn-cgi/image/${params}${encoded}`;
}

/**
 * Default options for product thumbnail transformations.
 * @type {Record<string, string|number>}
 */
export const CFIMG_THUMB = { fit: 'cover', quality: 82, format: 'auto' };
