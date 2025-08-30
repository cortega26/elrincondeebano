import { createSafeElement, showErrorMessage } from './utils.js';

let cart = [];
try {
  cart = JSON.parse(globalThis.localStorage?.getItem('cart')) || [];
} catch {
  cart = [];
}

export const getCartItemQuantity = (productId) => {
  const item = cart.find(item => item.id === productId);
  return item ? item.quantity : 0;
};

export const updateCartIcon = () => {
  const cartCount = document.getElementById('cart-count');
  const totalItems = cart.reduce((total, item) => total + item.quantity, 0);
  if (cartCount) {
    cartCount.textContent = totalItems;
    cartCount.setAttribute('aria-label', `${totalItems} items in cart`);
  }
};

const saveCart = () => {
  try {
    globalThis.localStorage?.setItem('cart', JSON.stringify(cart));
  } catch (error) {
    console.error('Error al guardar el carrito:', error);
    showErrorMessage('Error al guardar el carrito. Tus cambios podrían no persistir.');
  }
};

export const toggleActionArea = (btn, quantityControl, showQuantity) => {
  if (!btn || !quantityControl) return;
  if (showQuantity) {
    btn.style.display = 'none';
    quantityControl.style.display = 'flex';
  } else {
    quantityControl.style.display = 'none';
    btn.style.display = 'flex';
  }
};

export const renderCart = () => {
  const cartItems = document.getElementById('cart-items');
  const cartTotal = document.getElementById('cart-total');
  if (!cartItems || !cartTotal) return;
  cartItems.innerHTML = '';
  let total = 0;
  cart.forEach(item => {
    const discounted = item.price - (item.discount || 0);
    const itemEl = createSafeElement('div', { class: 'cart-item', 'data-id': item.id });
    itemEl.appendChild(createSafeElement('span', { class: 'item-quantity' }, [item.quantity.toString()]));
    cartItems.appendChild(itemEl);
    total += discounted * item.quantity;
  });
  cartTotal.textContent = `$${total.toLocaleString('es-CL')}`;
};

export const addToCart = (product, quantity) => {
  try {
    const existingItem = cart.find(item => item.id === product.id);
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
        quantity: Math.min(quantity, 50),
        category: product.category,
        stock: product.stock
      });
    }
    saveCart();
    updateCartIcon();
    renderCart();
    const quantityInput = document.querySelector(`[data-id="${product.id}"].quantity-input`);
    if (quantityInput) {
      quantityInput.value = Math.max(getCartItemQuantity(product.id), 1);
    }
  } catch (error) {
    console.error('Error al agregar al carrito:', error);
    showErrorMessage('Error al agregar el artículo al carrito. Por favor, intenta nuevamente.');
  }
};

export const removeFromCart = (productId) => {
  try {
    cart = cart.filter(item => item.id !== productId);
    saveCart();
    updateCartIcon();
    renderCart();
    const actionArea = document.querySelector(`.action-area[data-pid="${productId}"]`);
    if (actionArea) {
      const btn = actionArea.querySelector('.add-to-cart-btn');
      const qc = actionArea.querySelector('.quantity-control');
      toggleActionArea(btn, qc, false);
    }
  } catch (error) {
    console.error('Error al eliminar del carrito:', error);
    showErrorMessage('Error al eliminar el artículo del carrito. Por favor, intenta nuevamente.');
  }
};

export const updateQuantity = (product, change) => {
  try {
    const item = cart.find(item => item.id === product.id);
    const newQuantity = item ? item.quantity + change : 1;
    const actionArea = document.querySelector(`.action-area[data-pid="${product.id}"]`);
    const btn = actionArea?.querySelector('.add-to-cart-btn');
    const qc = actionArea?.querySelector('.quantity-control');

    if (newQuantity <= 0) {
      removeFromCart(product.id);
      toggleActionArea(btn, qc, false);
    } else if (newQuantity <= 50) {
      if (item) {
        item.quantity = newQuantity;
      } else {
        addToCart(product, 1);
        toggleActionArea(btn, qc, true);
      }
      saveCart();
      updateCartIcon();
      renderCart();

      const quantityInput = document.querySelector(`[data-id="${product.id}"].quantity-input`);
      if (quantityInput) {
        quantityInput.value = newQuantity;
        quantityInput.classList.add('quantity-changed');
        setTimeout(() => quantityInput.classList.remove('quantity-changed'), 300);
      }
    }
  } catch (error) {
    console.error('Error al actualizar cantidad:', error);
    showErrorMessage('Error al actualizar la cantidad. Por favor, intenta nuevamente.');
  }
};

export const __getCart = () => cart;
export const __resetCart = () => { cart = []; };
