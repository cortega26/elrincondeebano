export const MAX_CART_ITEM_QTY = 50;

export function parseNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function clampQty(value) {
  return Math.min(Math.max(parseNumber(value, 0), 0), MAX_CART_ITEM_QTY);
}

export function normalizeId(value) {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return '';
  }

  return String(value).trim();
}

export function normalizeCartItem(item) {
  const id = normalizeId(item?.id);
  const quantity = clampQty(item?.quantity);
  if (!id || quantity <= 0) {
    return null;
  }

  return {
    id,
    name: typeof item?.name === 'string' ? item.name : id,
    category: typeof item?.category === 'string' ? item.category : '',
    price: parseNumber(item?.price, 0),
    image: typeof item?.image === 'string' ? item.image : '',
    quantity,
  };
}

export function sanitizeCart(cart) {
  if (!Array.isArray(cart)) {
    return [];
  }

  return cart.map((item) => normalizeCartItem(item)).filter(Boolean);
}

export function getCartState(cart) {
  const normalizedCart = sanitizeCart(cart);
  const totalItems = normalizedCart.reduce((total, item) => total + clampQty(item.quantity), 0);
  const totalAmount = normalizedCart.reduce(
    (total, item) => total + parseNumber(item.price, 0) * clampQty(item.quantity),
    0
  );

  return { totalItems, totalAmount };
}

export function createCartItemFromProduct(product, quantity = 1) {
  return normalizeCartItem({
    id: product?.id,
    name: product?.name,
    category: product?.category,
    price: product?.price,
    image: product?.image,
    quantity,
  });
}

export function hydrateCartFromOrder(order) {
  if (!order || !Array.isArray(order.items)) {
    return [];
  }

  return sanitizeCart(
    order.items.map((item) => ({
      id: item.id,
      name: item.name,
      category: item.category,
      price: item.price,
      image: item.image,
      quantity: item.quantity,
    }))
  );
}
