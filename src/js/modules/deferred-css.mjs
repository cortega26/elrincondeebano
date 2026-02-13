export function applyDeferredStyles(doc = typeof document !== 'undefined' ? document : null) {
  if (!doc || typeof doc.querySelectorAll !== 'function') {
    return;
  }

  doc
    .querySelectorAll('link[rel="stylesheet"][media="print"][data-defer]')
    .forEach((link) => {
      /** @type {HTMLLinkElement} */ (link).media = 'all';
      link.removeAttribute('data-defer');
    });
}
