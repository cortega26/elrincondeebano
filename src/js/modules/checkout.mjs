export function setupCheckoutProgress() {
  try {
    if (typeof document === 'undefined') return;

    const state = {
      hasItems: null,
      hasPayment: null,
    };

    const readCartCount = () => {
      const cartCount = document.getElementById('cart-count');
      const count = Number(cartCount?.textContent || 0);
      return Number.isFinite(count) ? count : 0;
    };

    const hasSelectedPayment = () =>
      !!document.querySelector('input[name="paymentMethod"]:checked');

    const syncSubmitState = () => {
      const submitButton = /** @type {HTMLButtonElement | null} */ (
        document.getElementById('submit-cart')
      );
      if (!submitButton) return;

      const hasItems =
        typeof state.hasItems === 'boolean' ? state.hasItems : readCartCount() > 0;
      const hasPayment =
        typeof state.hasPayment === 'boolean' ? state.hasPayment : hasSelectedPayment();
      const shouldDisable = !hasItems || !hasPayment;

      submitButton.disabled = shouldDisable;
      submitButton.setAttribute('aria-disabled', shouldDisable ? 'true' : 'false');
    };

    const clearPaymentError = () => {
      const paymentError = document.getElementById('payment-error');
      if (paymentError) {
        paymentError.textContent = '';
      }
    };

    const handleCartUpdate = (event) => {
      const detail = event?.detail || {};
      if (typeof detail.totalItems === 'number') {
        state.hasItems = detail.totalItems > 0;
      } else if (typeof detail.isEmpty === 'boolean') {
        state.hasItems = !detail.isEmpty;
      } else {
        state.hasItems = readCartCount() > 0;
      }
      state.hasPayment = hasSelectedPayment();
      syncSubmitState();
    };

    const handlePaymentChange = (event) => {
      const target = event?.target;
      if (!target || target.getAttribute('name') !== 'paymentMethod') return;
      state.hasPayment = hasSelectedPayment();
      if (typeof state.hasItems !== 'boolean') {
        state.hasItems = readCartCount() > 0;
      }
      clearPaymentError();
      syncSubmitState();
    };

    document.addEventListener('cart:updated', handleCartUpdate);
    document.addEventListener('change', handlePaymentChange);

    state.hasItems = readCartCount() > 0;
    state.hasPayment = hasSelectedPayment();
    syncSubmitState();
  } catch (error) {
    // Ignore logging failures in sandboxed environments.
  }
}

export function createCheckoutSubmission(
  { getCart, renderCart, showOffcanvas } = /** @type {Record<string, any>} */ ({})
) {
  const submitCart = () => {
    if (typeof document === 'undefined' || typeof getCart !== 'function') return;
    const cartItems = getCart();
    if (!cartItems || cartItems.length === 0) {
      if (typeof renderCart === 'function') {
        renderCart();
      }
      try {
        if (typeof showOffcanvas === 'function') {
          showOffcanvas('#cartOffcanvas');
        }
      } catch (error) {
        // Ignore failures opening the offcanvas.
      }
      const emptyMessage = /** @type {HTMLElement | null} */ (
        document.querySelector('.cart-empty-message')
      );
      if (emptyMessage && typeof emptyMessage.focus === 'function') {
        emptyMessage.focus();
      }
      return;
    }

    const paymentError = document.getElementById('payment-error');
    const selectedPayment = document.querySelector('input[name="paymentMethod"]:checked');
    if (!selectedPayment) {
      if (paymentError) {
        paymentError.textContent = 'Por favor seleccione un método de pago';
      }
      const firstPayment = /** @type {HTMLInputElement | null} */ (
        document.querySelector('input[name="paymentMethod"]')
      );
      if (firstPayment && typeof firstPayment.focus === 'function') {
        firstPayment.focus();
      }
      return;
    }
    if (paymentError) {
      paymentError.textContent = '';
    }

    let message = 'Mi pedido:\n\n';
    cartItems.forEach((item) => {
      const discountedPrice = item.price - (item.discount || 0);
      message += `${item.name}\n`;
      message += `Cantidad: ${item.quantity}\n`;
      message += `Precio unitario: $${discountedPrice.toLocaleString('es-CL')}\n`;
      message += `Subtotal: $${(discountedPrice * item.quantity).toLocaleString('es-CL')}\n\n`;
    });

    const total = cartItems.reduce(
      (sum, item) => sum + (item.price - (item.discount || 0)) * item.quantity,
      0
    );
    message += `Total: $${total.toLocaleString('es-CL')}\n`;
    message += `Método de pago: ${/** @type {HTMLInputElement} */ (selectedPayment).value}`;

    const encodedMessage = encodeURIComponent(message);
    window.open(`https://wa.me/56951118901?text=${encodedMessage}`, '_blank');
  };

  return { submitCart };
}
