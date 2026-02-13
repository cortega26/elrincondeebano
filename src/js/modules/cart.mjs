import { log } from '../utils/logger.mts';

export function createCartManager({
  createSafeElement,
  createCartThumbnail,
  toggleActionArea,
  showErrorMessage,
  getUpdateProductDisplay,
} = /** @type {Record<string, any>} */ ({})) {
  let cart = [];
  const normalizeId = (value) => (value === null || value === undefined ? '' : String(value));
  const clampQuantity = (value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return 0;
    return Math.min(Math.max(parsed, 0), 50);
  };
  const normalizeCartItem = (item) => {
    if (!item || item.id === null || item.id === undefined) {
      return null;
    }
    const id = normalizeId(item.id);
    if (!id) {
      return null;
    }
    const quantity = clampQuantity(item.quantity);
    if (quantity <= 0) {
      return null;
    }
    return { ...item, id, quantity };
  };

  const loadCart = () => {
    try {
      const stored = JSON.parse(globalThis.localStorage?.getItem('cart')) || [];
      cart = Array.isArray(stored) ? stored.map(normalizeCartItem).filter(Boolean) : [];
    } catch {
      cart = [];
    }
  };

  loadCart();

  const getCart = () => cart;
  const resetCart = () => {
    cart = [];
  };

  const getCartItemQuantity = (productId) => {
    const id = normalizeId(productId);
    if (!id) return 0;
    const item = cart.find((item) => item.id === id);
    return item ? item.quantity : 0;
  };

  const updateCartIcon = () => {
    const cartCount = document.getElementById('cart-count');
    const totalItems = cart.reduce((total, item) => total + clampQuantity(item.quantity), 0);
    if (cartCount) {
      if (cartCount.dataset.initialized !== '1') {
        cartCount.dataset.initialized = '1';
      }
      cartCount.textContent = String(totalItems);
      const productLabel = totalItems === 1 ? 'producto' : 'productos';
      cartCount.setAttribute('aria-label', `${totalItems} ${productLabel} en el carrito`);
    }
  };

  const restartAnimationClass = (element, className, timeoutMs = 400) => {
    if (!element || !className) return;
    element.classList.remove(className);
    void element.offsetWidth;
    element.classList.add(className);
    const cleanup = () => element.classList.remove(className);
    element.addEventListener('animationend', cleanup, { once: true });
    setTimeout(cleanup, timeoutMs);
  };

  const bumpCartBadge = () => {
    const badge = document.getElementById('cart-count');
    restartAnimationClass(badge, 'cart-count-bump', 500);
  };

  const bumpCartTotal = () => {
    const total = document.getElementById('cart-total');
    restartAnimationClass(total, 'cart-total-bump', 500);
  };

  const dispatchCartUpdate = ({ isEmpty, total, totalItems }) => {
    if (typeof document === 'undefined') return;
    const EventCtor = document.defaultView?.CustomEvent || globalThis.CustomEvent;
    if (typeof EventCtor !== 'function') return;
    let event;
    try {
      event = new EventCtor('cart:updated', {
        detail: { isEmpty, total, totalItems },
      });
    } catch {
      event = null;
    }
    if (event) {
      document.dispatchEvent(event);
    }
  };

  const pulseAddToCartButton = (productId) => {
    const id = normalizeId(productId);
    if (!id) return;
    const actionArea = document.querySelector(`.action-area[data-pid="${id}"]`);
    const button = actionArea?.querySelector('.add-to-cart-btn');
    restartAnimationClass(button, 'is-added', 350);
  };

  const saveCart = () => {
    try {
      globalThis.localStorage?.setItem('cart', JSON.stringify(cart));
    } catch (error) {
      log('error', 'cart_save_failed', { error });
      if (typeof showErrorMessage === 'function') {
        showErrorMessage('Error al guardar el carrito. Tus cambios podrían no persistir.');
      }
    }
  };

  const renderCart = () => {
    const cartItems = document.getElementById('cart-items');
    const cartTotal = document.getElementById('cart-total');
    if (!cartItems || !cartTotal || typeof createSafeElement !== 'function') return;

    cartItems.innerHTML = '';
    let total = 0;
    let totalItems = 0;
    const isEmpty = cart.length === 0;

    if (isEmpty) {
      cartItems.appendChild(
        createSafeElement(
          'div',
          {
            class: 'alert alert-info mb-0 cart-empty-message',
            role: 'status',
            tabindex: '-1',
          },
          ['Tu carrito está vacío. Agrega productos antes de realizar el pedido.']
        )
      );
    } else {
      cart.forEach((item) => {
        const discountedPrice = item.price - (item.discount || 0);

        const itemElement = createSafeElement('div', {
          class: 'cart-item mb-3 d-flex align-items-start',
          'aria-label': `Producto en carrito: ${item.name}`,
        });

        const contentContainer = createSafeElement('div', {
          class: 'cart-item-content flex-grow-1',
        });

        contentContainer.appendChild(
          createSafeElement('div', { class: 'fw-bold mb-1' }, [item.name])
        );

        const quantityContainer = createSafeElement('div', { class: 'mb-2' });
        const decreaseBtn = createSafeElement(
          'button',
          {
            class: 'btn btn-sm btn-secondary decrease-quantity',
            'data-id': item.id,
            'aria-label': `Disminuir cantidad de ${item.name}`,
          },
          ['-']
        );
        const increaseBtn = createSafeElement(
          'button',
          {
            class: 'btn btn-sm btn-secondary increase-quantity',
            'data-id': item.id,
            'aria-label': `Aumentar cantidad de ${item.name}`,
          },
          ['+']
        );
        const quantitySpan = createSafeElement(
          'span',
          {
            class: 'mx-2 item-quantity',
            'aria-label': `Cantidad de ${item.name}`,
          },
          [item.quantity.toString()]
        );
        quantityContainer.appendChild(decreaseBtn);
        quantityContainer.appendChild(quantitySpan);
        quantityContainer.appendChild(increaseBtn);
        contentContainer.appendChild(quantityContainer);

        contentContainer.appendChild(
          createSafeElement('div', { class: 'text-muted small' }, [
            `Precio: $${discountedPrice.toLocaleString('es-CL')}`,
          ])
        );
        contentContainer.appendChild(
          createSafeElement('div', { class: 'fw-bold' }, [
            `Subtotal: $${(discountedPrice * item.quantity).toLocaleString('es-CL')}`,
          ])
        );

        const removeBtn = createSafeElement(
          'button',
          {
            class: 'btn btn-sm btn-danger remove-item mt-2',
            'data-id': item.id,
            'aria-label': `Eliminar ${item.name} del carrito`,
          },
          ['Eliminar']
        );
        contentContainer.appendChild(removeBtn);

        const isSubcategoryPage =
          typeof window !== 'undefined' && window.location.pathname.includes('/pages/');
        let adjustedImagePath;
        if (isSubcategoryPage) {
          adjustedImagePath = `../${(item.image_path || '').replace(/^\//, '')}`;
        } else {
          adjustedImagePath = item.image_path;
        }

        const thumbnailContainer = createSafeElement('div', {
          class: 'cart-item-thumb ms-3 flex-shrink-0',
        });
        const thumbnailPicture = createCartThumbnail({
          imagePath: item.thumbnail_path || adjustedImagePath,
          avifPath: item.image_avif_path,
          alt: item.name,
        });
        const fallbackImg = thumbnailPicture.querySelector('img');
        if (fallbackImg) {
          if (!fallbackImg.getAttribute('src') && adjustedImagePath) {
            fallbackImg.setAttribute('src', adjustedImagePath);
          }
          if (Array.isArray(item.thumbnail_variants)) {
            const parts = item.thumbnail_variants
              .filter((v) => v && v.url && v.width)
              .map((v) => `${v.url} ${v.width}w`);
            if (parts.length) {
              fallbackImg.setAttribute('srcset', parts.join(', '));
              fallbackImg.setAttribute('sizes', '100px');
            }
          } else if (!fallbackImg.getAttribute('sizes')) {
            fallbackImg.setAttribute('sizes', '100px');
          }
        }
        thumbnailContainer.appendChild(thumbnailPicture);

        itemElement.appendChild(contentContainer);
        itemElement.appendChild(thumbnailContainer);
        cartItems.appendChild(itemElement);

        total += discountedPrice * item.quantity;
        totalItems += clampQuantity(item.quantity);
      });
    }

    cartTotal.textContent = `Total: $${total.toLocaleString('es-CL')}`;
    cartTotal.setAttribute('aria-label', `Total: $${total.toLocaleString('es-CL')}`);

    const creditOption = document.getElementById('payment-credit-container');
    if (creditOption) {
      if (total >= 30000) {
        creditOption.classList.remove('d-none');
      } else {
        creditOption.classList.add('d-none');
        const creditInput = /** @type {HTMLInputElement | null} */ (
          creditOption.querySelector('input')
        );
        if (creditInput) {
          creditInput.checked = false;
        }
      }
    }

    const submitCartBtn = /** @type {HTMLButtonElement | null} */ (
      document.getElementById('submit-cart')
    );
    if (submitCartBtn) {
      submitCartBtn.disabled = isEmpty;
      submitCartBtn.setAttribute('aria-disabled', isEmpty ? 'true' : 'false');
    }

    const emptyCartBtn = /** @type {HTMLButtonElement | null} */ (
      document.getElementById('empty-cart')
    );
    if (emptyCartBtn) {
      emptyCartBtn.disabled = isEmpty;
      emptyCartBtn.setAttribute('aria-disabled', isEmpty ? 'true' : 'false');
    }

    const paymentInputs = /** @type {NodeListOf<HTMLInputElement>} */ (
      document.querySelectorAll('input[name="paymentMethod"]')
    );
    if (paymentInputs.length) {
      paymentInputs.forEach((input) => {
        input.disabled = isEmpty;
        if (isEmpty) {
          input.checked = false;
        }
      });
    }

    const paymentError = document.getElementById('payment-error');
    if (paymentError && isEmpty) {
      paymentError.textContent = '';
    }

    dispatchCartUpdate({ isEmpty, total, totalItems });
  };

  const addToCart = (product, quantity) => {
    try {
      const productId = normalizeId(product?.id);
      if (!productId) {
        throw new Error('Producto inválido');
      }
      const addQuantity = clampQuantity(quantity) || 1;
      const existingItem = cart.find((item) => item.id === productId);
      if (existingItem) {
        existingItem.quantity = clampQuantity(existingItem.quantity + addQuantity);
      } else {
        cart.push({
          id: productId,
          name: product.name,
          description: product.description,
          price: product.price,
          discount: product.discount,
          image_path: product.image_path,
          image_avif_path: product.image_avif_path,
          quantity: clampQuantity(addQuantity) || 1,
          category: product.category,
          stock: product.stock,
        });
      }
      saveCart();
      updateCartIcon();
      bumpCartBadge();
      pulseAddToCartButton(productId);
      renderCart();
      bumpCartTotal();
      try {
        if (typeof window !== 'undefined' && typeof window.__analyticsTrack === 'function')
          window.__analyticsTrack('add_to_cart', {
            id: productId,
            q: addQuantity,
            price: product.price,
          });
      } catch (error) {
        // Ignore analytics tracking failures.
      }
      const quantityInput = /** @type {HTMLInputElement | null} */ (
        document.querySelector(`[data-id="${productId}"].quantity-input`)
      );
      if (quantityInput) {
        quantityInput.value = String(Math.max(getCartItemQuantity(productId), 1));
      }
    } catch (error) {
      log('error', 'cart_add_failed', { error });
      if (typeof showErrorMessage === 'function') {
        showErrorMessage(
          'Error al agregar el artículo al carrito. Por favor, intenta nuevamente.'
        );
      }
    }
  };

  const removeFromCart = (productId) => {
    try {
      const id = normalizeId(productId);
      if (!id) return;
      cart = cart.filter((item) => item.id !== id);
      saveCart();
      updateCartIcon();
      renderCart();
      bumpCartTotal();
      try {
        if (typeof window !== 'undefined' && typeof window.__analyticsTrack === 'function')
          window.__analyticsTrack('remove_from_cart', { id });
      } catch (error) {
        // Ignore analytics tracking failures.
      }
      const actionArea = document.querySelector(`.action-area[data-pid="${id}"]`);
      if (actionArea && typeof toggleActionArea === 'function') {
        const btn = actionArea.querySelector('.add-to-cart-btn');
        const qc = actionArea.querySelector('.quantity-control');
        toggleActionArea(btn, qc, false);
      }
    } catch (error) {
      log('error', 'cart_remove_failed', { error });
      if (typeof showErrorMessage === 'function') {
        showErrorMessage(
          'Error al eliminar el artículo del carrito. Por favor, intenta nuevamente.'
        );
      }
    }
  };

  const updateQuantity = (product, change) => {
    try {
      const productId = normalizeId(product?.id);
      if (!productId) {
        throw new Error('Producto inválido');
      }
      const item = cart.find((item) => item.id === productId);
      const currentQuantity = item ? clampQuantity(item.quantity) : 0;
      const newQuantity = currentQuantity + change;
      const actionArea = document.querySelector(`.action-area[data-pid="${productId}"]`);
      const btn = actionArea?.querySelector('.add-to-cart-btn');
      const qc = actionArea?.querySelector('.quantity-control');
      let usedAddToCart = false;

      if (newQuantity <= 0) {
        removeFromCart(productId);
        if (typeof toggleActionArea === 'function') {
          toggleActionArea(btn, qc, false);
        }
      } else if (newQuantity <= 50) {
        if (item) {
          item.quantity = newQuantity;
        } else {
          addToCart({ ...product, id: productId }, 1);
          usedAddToCart = true;
          if (typeof toggleActionArea === 'function') {
            toggleActionArea(btn, qc, true);
          }
        }
        saveCart();
        updateCartIcon();
        if (change > 0 && !usedAddToCart) {
          bumpCartBadge();
        }
        renderCart();
        bumpCartTotal();

        const quantityInput = /** @type {HTMLInputElement | null} */ (
          document.querySelector(`[data-id="${productId}"].quantity-input`)
        );
        if (quantityInput) {
          quantityInput.value = String(newQuantity);
          quantityInput.classList.add('quantity-changed');
          setTimeout(() => quantityInput.classList.remove('quantity-changed'), 300);
        }
      }
    } catch (error) {
      log('error', 'cart_update_quantity_failed', { error });
      if (typeof showErrorMessage === 'function') {
        showErrorMessage('Error al actualizar la cantidad. Por favor, intenta nuevamente.');
      }
    }
  };

  const emptyCart = () => {
    try {
      cart = [];
      saveCart();
      updateCartIcon();
      renderCart();
      const updater = typeof getUpdateProductDisplay === 'function' ? getUpdateProductDisplay() : null;
      if (typeof updater === 'function') {
        updater();
      }
    } catch (error) {
      log('error', 'cart_empty_failed', { error });
      if (typeof showErrorMessage === 'function') {
        showErrorMessage('Error al vaciar el carrito. Por favor, inténtelo de nuevo.');
      }
    }
  };

  const setupCartInteraction = () => {
    if (typeof document === 'undefined') return;
    const cartItems = document.getElementById('cart-items');
    if (cartItems) {
      cartItems.addEventListener('click', (e) => {
        const target = /** @type {EventTarget & { closest?: (selector: string) => Element | null }} */ (
          e.target
        );
        const hasClosest = !!target && typeof target.closest === 'function';
        if (!hasClosest) return;
        const elementTarget = /** @type {{ closest: (selector: string) => Element | null }} */ (
          target
        );
        const btn = elementTarget.closest('button');
        if (!target) return;
        if (!btn) return;

        const id = btn.getAttribute('data-id');
        if (!id) return;

        if (btn.classList.contains('increase-quantity')) {
          e.preventDefault();
          updateQuantity({ id }, 1);
        } else if (btn.classList.contains('decrease-quantity')) {
          e.preventDefault();
          updateQuantity({ id }, -1);
        } else if (btn.classList.contains('remove-item')) {
          e.preventDefault();
          removeFromCart(id);
        }
      });
    }

    const emptyCartBtn = document.getElementById('empty-cart');
    if (emptyCartBtn) {
      emptyCartBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (confirm('¿Estás seguro de que quieres vaciar el carrito?')) {
          emptyCart();
        }
      });
    }
  };

  return {
    getCart,
    resetCart,
    getCartItemQuantity,
    updateCartIcon,
    renderCart,
    addToCart,
    removeFromCart,
    updateQuantity,
    emptyCart,
    setupCartInteraction,
  };
}
