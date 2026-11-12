// Plan 116 (chunk 2): order submission extracted from the storefront.js
// monolith — the WhatsApp message builder, the confirmation summary and the
// submit flow, with the pending-order state kept inside the controller.
// Factory with injected dependencies (createCatalogViewController pattern);
// storefront.js remains the composition root.

export function createOrderSubmitController({
  createElement,
  formatCurrency,
  getCartState,
  getSelectedPaymentValue,
  readProfileForm,
  getSelectedSubstitutionPreference,
  saveProfile,
  savePreferredPayment,
  saveSubstitutionPreference,
  buildWhatsAppPreview,
  showOrderConfirmationDialog,
} = {}) {
  let pendingOrderData = null;

  // Plan 282: lines whose catalog entry is out of stock (or missing) are
  // reported by applyCartPriceIndex. Accept a Set or an array; omit the
  // argument to keep the pre-plan-282 output unchanged.
  function toUnavailableSet(unavailableIds) {
    if (unavailableIds instanceof Set) {
      return unavailableIds;
    }
    return new Set(Array.isArray(unavailableIds) ? unavailableIds : []);
  }

  function buildWhatsAppMessageText(
    cart,
    totalAmount,
    selectedPayment,
    substitutionPreference,
    deliveryNote,
    unavailableIds
  ) {
    const unavailable = toUnavailableSet(unavailableIds);
    const lines = [];
    lines.push('🛒 *Nuevo Pedido - El Rincón de Ébano*');
    lines.push('');

    cart.forEach((item) => {
      const effectivePrice = Math.max(0, item.price - (item.discount || 0));
      const subtotal = effectivePrice * item.quantity;
      lines.push(`*${item.name}*`);
      lines.push(
        `   ${item.quantity} × $${effectivePrice.toLocaleString('es-CL')} = $${subtotal.toLocaleString('es-CL')}`
      );
      if (unavailable.has(item.id)) {
        lines.push('   ⚠️ Sin stock en el catálogo');
      }
      lines.push('');
    });

    lines.push('_ _ _ _ _ _ _ _ _ _ _ _ _ _ _');
    lines.push('');
    lines.push(`*Total:* $${totalAmount.toLocaleString('es-CL')}`);
    lines.push(`*Pago:* ${selectedPayment}`);
    lines.push(`*Stock:* ${substitutionPreference}`);
    if (deliveryNote) {
      lines.push(`📝 *Nota:* ${deliveryNote}`);
    }

    return lines.join('\n');
  }

  function buildOrderConfirmSummary(
    cart,
    totalAmount,
    selectedPayment,
    substitutionPreference,
    deliveryNote,
    unavailableIds
  ) {
    const container = document.getElementById('order-confirm-summary');
    if (!container) {
      return;
    }

    const unavailable = toUnavailableSet(unavailableIds);
    container.replaceChildren();

    cart.forEach((item) => {
      const effectivePrice = Math.max(0, item.price - (item.discount || 0));
      const subtotal = effectivePrice * item.quantity;
      const row = createElement('div', { className: 'order-confirm__summary-row' });
      const info = createElement('div', { className: 'order-confirm__summary-item' });
      info.appendChild(
        createElement('div', { className: 'order-confirm__summary-item-name', text: item.name })
      );
      info.appendChild(
        createElement('div', {
          className: 'order-confirm__summary-item-meta',
          text: `${item.quantity} × ${formatCurrency(effectivePrice)}${unavailable.has(item.id) ? ' · Sin stock' : ''}`,
        })
      );
      const total = createElement('span', {
        className: 'order-confirm__summary-item-total',
        text: formatCurrency(subtotal),
      });
      row.appendChild(info);
      row.appendChild(total);
      container.appendChild(row);
    });

    const totalRow = createElement('div', { className: 'order-confirm__summary-total-row' });
    totalRow.appendChild(createElement('span', { text: 'Total' }));
    totalRow.appendChild(
      createElement('span', {
        className: 'order-confirm__summary-total-amount',
        text: formatCurrency(totalAmount),
      })
    );
    container.appendChild(totalRow);

    const metaDiv = createElement('div', { className: 'order-confirm__summary-meta' });
    const addMetaLine = (label, value) => {
      const line = document.createElement('div');
      const strong = document.createElement('strong');
      strong.textContent = label;
      line.appendChild(strong);
      line.appendChild(document.createTextNode(value));
      metaDiv.appendChild(line);
    };
    addMetaLine('Pago: ', selectedPayment);
    if (deliveryNote) {
      addMetaLine('Nota: ', `“${deliveryNote}”`);
    }
    addMetaLine('Stock: ', substitutionPreference);
    container.appendChild(metaDiv);
  }

  function submitCartOrder(cart, { unavailableIds = [] } = {}) {
    if (!Array.isArray(cart) || cart.length === 0) {
      return;
    }
    const unavailable = toUnavailableSet(unavailableIds);

    const paymentError = document.getElementById('payment-error');
    if (paymentError) {
      paymentError.textContent = '';
    }
    const selectedPayment = getSelectedPaymentValue();
    if (!selectedPayment) {
      if (paymentError) {
        paymentError.textContent = 'Selecciona un método de pago antes de enviar el pedido.';
      }
      const firstPayment = document.querySelector('input[name="paymentMethod"]');
      firstPayment?.focus();
      return;
    }

    const { totalAmount } = getCartState(cart);
    const profile = readProfileForm();
    const substitutionPreference = getSelectedSubstitutionPreference();

    saveProfile(profile);
    savePreferredPayment(selectedPayment);
    saveSubstitutionPreference(substitutionPreference);

    const message = buildWhatsAppMessageText(
      cart,
      totalAmount,
      selectedPayment,
      substitutionPreference,
      profile.deliveryNote,
      unavailable
    );

    pendingOrderData = {
      message,
      cart,
      totalAmount,
      selectedPayment,
      profile,
      substitutionPreference,
    };

    buildOrderConfirmSummary(
      cart,
      totalAmount,
      selectedPayment,
      substitutionPreference,
      profile.deliveryNote,
      unavailable
    );
    buildWhatsAppPreview(
      cart,
      totalAmount,
      selectedPayment,
      substitutionPreference,
      profile.deliveryNote,
      unavailable
    );
    showOrderConfirmationDialog();
  }

  function takePendingOrder() {
    const pending = pendingOrderData;
    pendingOrderData = null;
    return pending;
  }

  return {
    submitCartOrder,
    buildOrderConfirmSummary,
    buildWhatsAppMessageText,
    takePendingOrder,
  };
}
