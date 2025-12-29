// Basic navigation accessibility hooks (migrated from csp.js)
export function setupNavigationAccessibility() {
  try {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') document.body.classList.add('keyboard-navigation');
    });
    document.addEventListener('mousedown', () => {
      document.body.classList.remove('keyboard-navigation');
    });

    const style = document.createElement('style');
    if (window && window.__CSP_NONCE__) {
      style.setAttribute('nonce', window.__CSP_NONCE__);
    }
    style.textContent = `.keyboard-navigation *:focus { outline: 2px solid var(--primary-color); outline-offset: 2px; }`;
    document.head.appendChild(style);
  } catch (e) {
    console.warn('[modules/a11y] setupNavigationAccessibility error:', e);
  }
}

function getFocusableElements(container) {
  if (!container) return [];
  const selectors = [
    'a[href]',
    'area[href]',
    'button:not([disabled])',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
    '[contenteditable="true"]',
  ];
  return Array.from(container.querySelectorAll(selectors.join(','))).filter((el) => {
    if (!(el instanceof HTMLElement)) return false;
    const style = window.getComputedStyle(el);
    return style.visibility !== 'hidden' && style.display !== 'none';
  });
}

export function setupCartOffcanvasAccessibility() {
  try {
    const cartOffcanvas = document.getElementById('cartOffcanvas');
    if (!cartOffcanvas) return;

    const heading = cartOffcanvas.querySelector('#cartOffcanvasLabel');
    const triggerButton = document.getElementById('cart-icon');
    let lastFocusedElement = null;
    let keydownAttached = false;

    const handleKeydown = (event) => {
      if (event.key === 'Escape' && cartOffcanvas.dataset.bsFallback === '1') {
        event.preventDefault();
        cartOffcanvas.classList.remove('show');
        cartOffcanvas.setAttribute('aria-hidden', 'true');
        handleHide();
        return;
      }

      if (event.key !== 'Tab') return;
      const focusable = getFocusableElements(cartOffcanvas);
      if (!focusable.length) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey) {
        if (active === first || !cartOffcanvas.contains(active)) {
          event.preventDefault();
          last.focus();
        }
      } else if (active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    const attachKeydown = () => {
      if (!keydownAttached) {
        cartOffcanvas.addEventListener('keydown', handleKeydown);
        keydownAttached = true;
      }
    };

    const detachKeydown = () => {
      if (keydownAttached) {
        cartOffcanvas.removeEventListener('keydown', handleKeydown);
        keydownAttached = false;
      }
    };

    const focusInitial = () => {
      if (heading instanceof HTMLElement && typeof heading.focus === 'function') {
        heading.focus();
      } else {
        cartOffcanvas.focus();
      }
    };

    const handleHide = () => {
      detachKeydown();
      if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
        lastFocusedElement.focus();
      } else if (triggerButton && typeof triggerButton.focus === 'function') {
        triggerButton.focus();
      }
    };

    cartOffcanvas.addEventListener('show.bs.offcanvas', () => {
      lastFocusedElement =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      attachKeydown();
    });

    cartOffcanvas.addEventListener('shown.bs.offcanvas', () => {
      focusInitial();
    });

    cartOffcanvas.addEventListener('hidden.bs.offcanvas', () => {
      handleHide();
    });

    cartOffcanvas.addEventListener('click', (event) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (!target) return;
      const dismissTrigger = target.closest('[data-bs-dismiss="offcanvas"]');
      if (!dismissTrigger) return;
      if (cartOffcanvas.dataset.bsFallback === '1') {
        event.preventDefault();
        cartOffcanvas.classList.remove('show');
        cartOffcanvas.setAttribute('aria-hidden', 'true');
        handleHide();
      }
    });
  } catch (e) {
    console.warn('[modules/a11y] setupCartOffcanvasAccessibility error:', e);
  }
}
