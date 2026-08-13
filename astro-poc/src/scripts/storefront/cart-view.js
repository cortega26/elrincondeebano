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
      // New item: fall through to full render
    }

    cartContainer.replaceChildren();

    if (cart.length === 0) {
      if (isOrderJustSent()) {
        const sentWrapper = createElement('div', { className: 'cart-post-send' });
        const sentIcon = createElement('div', { className: 'cart-post-send__icon' });
        sentIcon.innerHTML =
          '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
        const sentTitle = createElement('h3', {
          className: 'cart-post-send__title',
          text: '¡Pedido enviado!',
        });
        const sentBody = createElement('div', { className: 'cart-post-send__body' });
        const sentP1 = document.createElement('p');
        sentP1.textContent =
          'Recibirás una respuesta por WhatsApp para confirmar el horario de entrega dentro del edificio.';
        const sentP2 = document.createElement('p');
        sentP2.textContent =
          'Si no recibes respuesta en 30 minutos, escríbenos directamente al mismo chat.';
        sentBody.appendChild(sentP1);
        sentBody.appendChild(sentP2);
        sentWrapper.appendChild(sentIcon);
        sentWrapper.appendChild(sentTitle);
        sentWrapper.appendChild(sentBody);
        cartContainer.appendChild(sentWrapper);
      } else {
        const emptyMessage = createElement('div', {
          className: 'alert alert-info mb-0 cart-empty-message',
          text: 'Tu carrito está vacío. Agrega productos antes de realizar el pedido.',
          attrs: {
            role: 'status',
            tabindex: '-1',
          },
        });
        cartContainer.appendChild(emptyMessage);
      }
    } else {
      const fragment = document.createDocumentFragment();
      cart.forEach((item) => {
        const line = createElement('div', {
          className: 'cart-item',
          attrs: { 'data-id': item.id },
        });

        const thumbWrapper = createElement('div', { className: 'cart-item-thumb flex-shrink-0' });
        const thumb = createElement('img', {
          className: 'cart-item-thumb-img',
          attrs: {
            src: item.image,
            alt: item.name,
            loading: 'lazy',
            decoding: 'async',
          },
        });
        thumbWrapper.appendChild(thumb);

        const content = createElement('div', { className: 'cart-item-content flex-grow-1' });
        const name = createElement('div', {
          className: 'fw-bold cart-item__title',
          text: item.name,
        });
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
          className: 'quantity-btn cart-item-qty-btn',
          text: '-',
          attrs: {
            type: 'button',
            'data-action': 'decrease',
            'data-id': item.id,
            'aria-label': 'Disminuir cantidad',
          },
        });
        const quantity = createElement('span', {
          className: 'quantity-value item-quantity',
          text: String(item.quantity),
          attrs: { 'aria-label': 'Cantidad', 'aria-live': 'polite', 'aria-atomic': 'true' },
        });
        const increaseBtn = createElement('button', {
          className: 'quantity-btn cart-item-qty-btn',
          text: '+',
          attrs: {
            type: 'button',
            'data-action': 'increase',
            'data-id': item.id,
            'aria-label': 'Aumentar cantidad',
          },
        });

        qtyRow.appendChild(decreaseBtn);
        qtyRow.appendChild(quantity);
        qtyRow.appendChild(increaseBtn);

        const removeBtn = createElement('button', {
          className: 'remove-item cart-item__remove',
          attrs: {
            type: 'button',
            'data-id': item.id,
            'aria-label': `Eliminar ${item.name ?? 'producto'} del carrito`,
          },
        });
        removeBtn.innerHTML =
          '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path></svg>' +
          '<span aria-hidden="true">Quitar</span>';

        const actions = createElement('div', { className: 'cart-item__actions' });
        actions.appendChild(qtyRow);
        actions.appendChild(removeBtn);
        content.appendChild(actions);

        line.appendChild(thumbWrapper);
        line.appendChild(content);
        fragment.appendChild(line);
      });
      cartContainer.appendChild(fragment);

      // Share cart button
      const shareRow = createElement('div', { className: 'cart-share-row mt-2' });
      const shareBtn = createElement('button', {
        className: 'btn btn-outline-secondary btn-sm w-100',
        text: 'Compartir carrito',
        attrs: { type: 'button', 'aria-label': 'Copiar enlace del carrito para compartir' },
      });
      shareBtn.addEventListener('click', function () {
        shareCart(cart);
        shareBtn.textContent = '¡Enlace copiado!';
        globalThis.setTimeout(function () {
          shareBtn.textContent = 'Compartir carrito';
        }, 2000);
      });
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
