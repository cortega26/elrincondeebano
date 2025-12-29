export function createCartManager({
  createSafeElement,
  createCartThumbnail,
  toggleActionArea,
  showErrorMessage,
  getUpdateProductDisplay,
} = {}) {
  let cart = [];

  const loadCart = () => {
    try {
      cart = JSON.parse(globalThis.localStorage?.getItem('cart')) || [];
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
    const item = cart.find((item) => item.id === productId);
    return item ? item.quantity : 0;
  };

  const updateCartIcon = () => {
    const cartCount = document.getElementById('cart-count');
    const totalItems = cart.reduce((total, item) => total + item.quantity, 0);
    if (cartCount) {
      if (cartCount.dataset.initialized !== '1') {
        cartCount.dataset.initialized = '1';
      }
      cartCount.textContent = String(totalItems);
      cartCount.setAttribute('aria-label', `${totalItems} items in cart`);
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

  const pulseAddToCartButton = (productId) => {
    if (!productId) return;
    const actionArea = document.querySelector(`.action-area[data-pid="${productId}"]`);
    const button = actionArea?.querySelector('.add-to-cart-btn');
    restartAnimationClass(button, 'is-added', 350);
  };

  const saveCart = () => {
    try {
      globalThis.localStorage?.setItem('cart', JSON.stringify(cart));
    } catch (error) {
      console.error('Error al guardar el carrito:', error);
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

    cart.forEach((item) => {
      const discountedPrice = item.price - (item.discount || 0);

      const itemElement = createSafeElement('div', {
        class: 'cart-item mb-3 d-flex align-items-start',
        'aria-label': `Cart item: ${item.name}`,
      });

      const contentContainer = createSafeElement('div', {
        class: 'cart-item-content flex-grow-1',
      });

      contentContainer.appendChild(createSafeElement('div', { class: 'fw-bold mb-1' }, [item.name]));

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
    });

    cartTotal.textContent = `Total: $${total.toLocaleString('es-CL')}`;
    cartTotal.setAttribute('aria-label', `Total: $${total.toLocaleString('es-CL')}`);

    const creditOption = document.getElementById('payment-credit-container');
    if (creditOption) {
      if (total >= 30000) {
        creditOption.classList.remove('d-none');
      } else {
        creditOption.classList.add('d-none');
        const creditInput = creditOption.querySelector('input');
        if (creditInput) {
          creditInput.checked = false;
        }
      }
    }
  };

  const addToCart = (product, quantity) => {
    try {
      const existingItem = cart.find((item) => item.id === product.id);
      if (existingItem) {
        existingItem.quantity = Math.min(existingItem.quantity + quantity, 50);
      } else {
        cart.push({
          id: product.id,
          name: product.name,
          description: product.description,
          price: product.price,
          discount: product.discount,
          image_path: product.image_path,
          image_avif_path: product.image_avif_path,
          quantity: Math.min(quantity, 50),
          category: product.category,
          stock: product.stock,
        });
      }
      saveCart();
      updateCartIcon();
      bumpCartBadge();
      pulseAddToCartButton(product.id);
      renderCart();
      bumpCartTotal();
      try {
        if (typeof window !== 'undefined' && typeof window.__analyticsTrack === 'function')
          window.__analyticsTrack('add_to_cart', {
            id: product.id,
            q: quantity,
            price: product.price,
          });
      } catch (error) {
        // Ignore analytics tracking failures.
      }
      const quantityInput = document.querySelector(`[data-id="${product.id}"].quantity-input`);
      if (quantityInput) {
        quantityInput.value = Math.max(getCartItemQuantity(product.id), 1);
      }
    } catch (error) {
      console.error('Error al agregar al carrito:', error);
      if (typeof showErrorMessage === 'function') {
        showErrorMessage(
          'Error al agregar el artículo al carrito. Por favor, intenta nuevamente.'
        );
      }
    }
  };

  const removeFromCart = (productId) => {
    try {
      cart = cart.filter((item) => item.id !== productId);
      saveCart();
      updateCartIcon();
      renderCart();
      bumpCartTotal();
      try {
        if (typeof window !== 'undefined' && typeof window.__analyticsTrack === 'function')
          window.__analyticsTrack('remove_from_cart', { id: productId });
      } catch (error) {
        // Ignore analytics tracking failures.
      }
      const actionArea = document.querySelector(`.action-area[data-pid="${productId}"]`);
      if (actionArea && typeof toggleActionArea === 'function') {
        const btn = actionArea.querySelector('.add-to-cart-btn');
        const qc = actionArea.querySelector('.quantity-control');
        toggleActionArea(btn, qc, false);
      }
    } catch (error) {
      console.error('Error al eliminar del carrito:', error);
      if (typeof showErrorMessage === 'function') {
        showErrorMessage(
          'Error al eliminar el artículo del carrito. Por favor, intenta nuevamente.'
        );
      }
    }
  };

  const updateQuantity = (product, change) => {
    try {
      const item = cart.find((item) => item.id === product.id);
      const newQuantity = item ? item.quantity + change : 1;
      const actionArea = document.querySelector(`.action-area[data-pid="${product.id}"]`);
      const btn = actionArea?.querySelector('.add-to-cart-btn');
      const qc = actionArea?.querySelector('.quantity-control');
      let usedAddToCart = false;

      if (newQuantity <= 0) {
        removeFromCart(product.id);
        if (typeof toggleActionArea === 'function') {
          toggleActionArea(btn, qc, false);
        }
      } else if (newQuantity <= 50) {
        if (item) {
          item.quantity = newQuantity;
        } else {
          addToCart(product, 1);
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

        const quantityInput = document.querySelector(`[data-id="${product.id}"].quantity-input`);
        if (quantityInput) {
          quantityInput.value = newQuantity;
          quantityInput.classList.add('quantity-changed');
          setTimeout(() => quantityInput.classList.remove('quantity-changed'), 300);
        }
      }
    } catch (error) {
      console.error('Error al actualizar cantidad:', error);
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
      console.error('Error al vaciar el carrito:', error);
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
        const target = e.target;
        const btn = target.closest('button');
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
