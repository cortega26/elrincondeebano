// Utility helper functions for the storefront

export const debounce = (func, delay) => {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func(...args), delay);
  };
};

export const memoize = (fn, cacheSize = 100) => {
  const cache = new Map();
  return (...args) => {
    const key = JSON.stringify(args);
    if (cache.has(key)) return cache.get(key);
    const result = fn(...args);
    cache.set(key, result);
    if (cache.size > cacheSize) {
      const firstKey = cache.keys().next().value;
      cache.delete(firstKey);
    }
    return result;
  };
};

export const normalizeString = (str) => {
  if (!str) return '';
  try {
    return String(str)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]/g, '')
      .toLowerCase();
  } catch {
    return String(str).toLowerCase();
  }
};

export const generateStableId = (product) => {
  const baseString = `${product.name}-${product.category}`.toLowerCase();
  let hash = 0;
  for (let i = 0; i < baseString.length; i++) {
    const char = baseString.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // convert to 32-bit int
  }
  return `pid-${Math.abs(hash)}`;
};

export const sanitizeHTML = (unsafe) => {
  const element = document.createElement('div');
  element.textContent = unsafe;
  return element.innerHTML;
};

export const createSafeElement = (tag, attributes = {}, children = []) => {
  const element = document.createElement(tag);
  Object.entries(attributes).forEach(([key, value]) => {
    if (key === 'text') {
      element.textContent = value;
    } else {
      element.setAttribute(key, value);
    }
  });
  children.forEach(child => {
    element.appendChild(
      typeof child === 'string' ? document.createTextNode(child) : child
    );
  });
  return element;
};

export const showErrorMessage = (message) => {
  const errorMessage = createSafeElement('div', { class: 'error-message', role: 'alert' }, [
    createSafeElement('p', {}, [message]),
    createSafeElement('button', { class: 'retry-button' }, ['Intentar nuevamente'])
  ]);
  const productContainer = document.getElementById('product-container');
  if (productContainer) {
    productContainer.innerHTML = '';
    productContainer.appendChild(errorMessage);
  }
};
