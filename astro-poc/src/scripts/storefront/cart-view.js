// Plan 116 (chunk 1): cart rendering extracted from the storefront.js
// monolith. Factory with injected dependencies, mirroring the
// createCatalogViewController pattern. storefront.js stays the composition
// root: it builds the controller and rebinds the local renderCart.

export function createCartViewController({
  container,
  totalElement,
  createElement,
  formatCurrency,
  getCartState,
  triggerTransientClass,
  syncCheckoutState,
  syncMobileCartShortcut,
  shareCart,
  isOrderJustSent,
  renderCompanionSuggestions,
  companionRules,
} = {}) {
  function renderCart(cart, { animateTotal = false, changedItemId = null } = {}) {
    const cartContainer = container || document.getElementById('cart-items');
    const cartTotalElement = totalElement || document.getElementById('cart-total');

    if (!(cartContainer instanceof HTMLElement) || !(cartTotalElement instanceof HTMLElement)) {
      return;
    }

    // Targeted update for a single changed item when the cart already has items rendered
    if (changedItemId && cartContainer.querySelector('.cart-item')) {
      const cartItem = cart.find((item) => item.id === changedItemId);
      const existingEl = cartContainer.querySelector(`.cart-item[data-id="${changedItemId}"]`);

      // Quantity update for existing item
      if (cartItem && existingEl) {
        const qtySpan = existingEl.querySelector('.item-quantity');
        if (qtySpan) {
          qtySpan.textContent = String(cartItem.quantity);
        }
        const subtotalSpan = existingEl.querySelector('.cart-item__subtotal');
        if (subtotalSpan) {
          const effectivePrice = Math.max(0, cartItem.price - (cartItem.discount || 0));
          subtotalSpan.textContent = `Subtotal: ${formatCurrency(effectivePrice * cartItem.quantity)}`;
        }
        // Update total and sync state
        const { totalAmount } = getCartState(cart);
        cartTotalElement.textContent = `Total: ${formatCurrency(totalAmount)}`;
        if (animateTotal) {
          triggerTransientClass(cartTotalElement, 'cart-total-bump');
        }
        syncCheckoutState(cart, totalAmount);
        syncMobileCartShortcut(cart, totalAmount);
        return;
      }

      // Item removed (quantity to 0)
      if (!cartItem && existingEl) {
        existingEl.remove();
        // If no items left, also remove share row and fall through to empty state
        const shareRow = cartContainer.querySelector('.cart-share-row');
        if (shareRow && !cartContainer.querySelector('.cart-item')) {
          shareRow.remove();
          // Fall through to show empty state
        } else {
          const { totalAmount } = getCartState(cart);
          cartTotalElement.textContent = `Total: ${formatCurrency(totalAmount)}`;
          if (animateTotal) {
            triggerTransientClass(cartTotalElement, 'cart-total-bump');
          }
          syncCheckoutState(cart, totalAmount);
          syncMobileCartShortcut(cart, totalAmount);
          return;
        }
      }
    }

    cartContainer.replaceChildren();

    if (cart.length === 0) {
      const emptyMsg = createElement('div', {
        className: 'alert alert-info mb-0 cart-empty-message',
        attrs: { role: 'status' },
        text: 'Tu carrito está vacío. Agrega productos antes de realizar el pedido.',
      });
      cartContainer.appendChild(emptyMsg);
      const { totalAmount } = getCartState(cart);
      cartTotalElement.textContent = `Total: ${formatCurrency(totalAmount)}`;
      syncCheckoutState(cart, totalAmount);
      syncMobileCartShortcut(cart, totalAmount);
      return;
    }

    const fragment = document.createDocumentFragment();

    cart.forEach((item) => {
      const row = createElement('div', {
        className: 'cart-item',
        attrs: { 'data-id': item.id },
      });

      const thumbWrapper = createElement('div', { className: 'cart-item__thumb-wrapper' });
      const thumb = createElement('img', {
        className: 'cart-item__thumb',
        attrs: {
          src: item.image || '',
          alt: item.name || 'Producto',
          loading: 'lazy',
          decoding: 'async',
        },
      });
      thumbWrapper.appendChild(thumb);

      const content = createElement('div', { className: 'cart-item-content flex-grow-1' });
      const name = createElement('div', { className: 'fw-bold cart-item__title', text: item.name });
      content.appendChild(name);

      const effectivePrice = Math.max(0, item.price - (item.discount || 0));
      const meta = createElement('div', { className: 'cart-item__meta' });
      meta.appendChild(
        createElement('span', {
          className: 'cart-item__price-line',
          text: `Unitario: ${formatCurrency(effectivePrice)}`,
        })
      );
      meta.appendChild(
        createElement('span', {
          className: 'cart-item__subtotal',
          text: `Subtotal: ${formatCurrency(effectivePrice * item.quantity)}`,
        })
      );
      content.appendChild(meta);

      const qtyRow = createElement('div', {
        className: 'cart-qty-row',
        attrs: { role: 'group', 'aria-label': 'Selección de cantidad' },
      });

      const decreaseBtn = createElement('button', {
        className: 'quantity-btn',
        attrs: {
          type: 'button',
          'data-action': 'decrease',
          'data-id': item.id,
          'aria-label': `Disminuir cantidad de ${item.name}`,
        },
        text: '−',
      });
      const qtyValue = createElement('span', {
        className: 'quantity-value item-quantity',
        attrs: { 'data-id': item.id, 'aria-live': 'polite', 'aria-atomic': 'true' },
        text: String(item.quantity),
      });
      const increaseBtn = createElement('button', {
        className: 'quantity-btn',
        attrs: {
          type: 'button',
          'data-action': 'increase',
          'data-id': item.id,
          'aria-label': `Aumentar cantidad de ${item.name}`,
        },
        text: '+',
      });
      qtyRow.appendChild(decreaseBtn);
      qtyRow.appendChild(qtyValue);
      qtyRow.appendChild(increaseBtn);
      content.appendChild(qtyRow);

      const removeBtn = createElement('button', {
        className: 'cart-item__remove',
        attrs: {
          type: 'button',
          'data-action': 'remove',
          'data-id': item.id,
          'aria-label': `Quitar ${item.name} del carrito`,
        },
      });
      removeBtn.innerHTML =
        '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';

      row.appendChild(thumbWrapper);
      row.appendChild(content);
      row.appendChild(removeBtn);

      fragment.appendChild(row);
    });

    cartContainer.appendChild(fragment);

    if (typeof renderCompanionSuggestions === 'function') {
      renderCompanionSuggestions(cart, companionRules);
    }

    if (cart.length > 1 && !isOrderJustSent()) {
      const shareRow = createElement('div', { className: 'cart-share-row' });
      const shareText = createElement('span', { text: 'Comparte tu carrito con un enlace:' });
      const shareBtn = createElement('button', {
        className: 'btn btn-outline-primary btn-sm',
        attrs: { type: 'button', 'data-action': 'share-cart' },
        text: 'Compartir carrito',
      });
      shareBtn.addEventListener('click', function () {
        shareCart(cart);
        shareBtn.textContent = '¡Enlace copiado!';
        globalThis.setTimeout(function () {
          shareBtn.textContent = 'Compartir carrito';
        }, 2000);
      });
      shareRow.appendChild(shareText);
      shareRow.appendChild(shareBtn);
      cartContainer.appendChild(shareRow);
    }

    const { totalAmount } = getCartState(cart);
    cartTotalElement.textContent = `Total: ${formatCurrency(totalAmount)}`;
    if (animateTotal) {
      triggerTransientClass(cartTotalElement, 'cart-total-bump');
    }
    syncCheckoutState(cart, totalAmount);
    syncMobileCartShortcut(cart, totalAmount);
  }

  return { renderCart };
}
