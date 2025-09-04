export function cfimg(path, opts = {}) {
  const p = path.startsWith('/') ? path : '/' + path;
  const params = Object.entries(opts).map(([k, v]) => `${k}=${v}`).join(',');
  return `/cdn-cgi/image/${params}${p}`;
}

export const CFIMG_THUMB = { fit: 'cover', quality: 82, format: 'auto' };
