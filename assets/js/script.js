// Entry point aggregating storefront modules
import { generateStableId, debounce, memoize, normalizeString, sanitizeHTML, createSafeElement, showErrorMessage } from './utils.js';
import { fetchProducts } from './products.js';
import { addToCart, removeFromCart, updateQuantity, updateCartIcon, __getCart } from './cart.js';
import { showUpdateNotification, showServiceWorkerError, showConnectivityNotification } from './notifications.js';

// Re-export commonly used helpers for tests and external usage
export {
  generateStableId,
  debounce,
  memoize,
  normalizeString,
  sanitizeHTML,
  createSafeElement,
  showErrorMessage,
  fetchProducts,
  addToCart,
  removeFromCart,
  updateQuantity,
  updateCartIcon,
  showUpdateNotification,
  showServiceWorkerError,
  showConnectivityNotification,
  __getCart
};
