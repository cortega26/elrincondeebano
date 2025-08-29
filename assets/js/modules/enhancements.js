// UI enhancement styles (migrated from csp.js)
export function injectEnhancementStyles() {
  try {
    const styleEl = document.createElement('style');
    if (window && window.__CSP_NONCE__) {
      styleEl.setAttribute('nonce', window.__CSP_NONCE__);
    }
    styleEl.textContent = `
      /* Miniatura del carrito (mantener consistente con base/enhanced CSS) */
      .cart-item-thumb { width: 72px; height: 72px; flex-shrink: 0; }
      .cart-item-thumb img, .cart-item-thumb-img { width: 100%; height: 100%; object-fit: cover; border-radius: 0.25rem; }

      /* Contornos de enfoque claros para accesibilidad */
      .navbar .nav-link:focus,
      .navbar .dropdown-item:focus {
        outline: 2px solid var(--primary-color);
        outline-offset: 2px;
      }

      /* Espaciado entre botones en el offcanvas del carrito */
      #cartOffcanvas .offcanvas-body > .btn + .btn { margin-top: 0.5rem !important; }
    `;
    document.head.appendChild(styleEl);
  } catch (e) {
    console.warn('[modules/enhancements] injectEnhancementStyles error:', e);
  }
}
