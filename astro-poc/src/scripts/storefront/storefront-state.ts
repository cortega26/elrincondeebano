export const MAX_CART_ITEM_QTY = 50;

export interface CartItem {
  id: string;
  name: string;
  category: string;
  price: number;
  image: string;
  quantity: number;
}

export function parseNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function clampQty(value: unknown): number {
  return Math.min(Math.max(parseNumber(value, 0), 0), MAX_CART_ITEM_QTY);
}

export function normalizeId(value: unknown): string {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return '';
  }

  return String(value).trim();
}

export function normalizeCartItem(item: unknown): CartItem | null {
  const itemObj = item as Record<string, unknown> | null | undefined;
  const id = normalizeId(itemObj?.id);
  const quantity = clampQty(itemObj?.quantity);
  if (!id || quantity <= 0) {
    return null;
  }

  return {
    id,
    name: typeof itemObj?.name === 'string' ? itemObj.name : id,
    category: typeof itemObj?.category === 'string' ? itemObj.category : '',
    price: parseNumber(itemObj?.price, 0),
    image: typeof itemObj?.image === 'string' ? itemObj.image : '',
    quantity,
  };
}

export function sanitizeCart(cart: unknown): CartItem[] {
  if (!Array.isArray(cart)) {
    return [];
  }

  return cart
    .map((item) => normalizeCartItem(item))
    .filter((item): item is CartItem => item !== null);
}

export interface CartState {
  totalItems: number;
  totalAmount: number;
}

export function getCartState(cart: unknown): CartState {
  const normalizedCart = sanitizeCart(cart);
  const totalItems = normalizedCart.reduce((total, item) => total + clampQty(item.quantity), 0);
  const totalAmount = normalizedCart.reduce(
    (total, item) => total + parseNumber(item.price, 0) * clampQty(item.quantity),
    0
  );

  return { totalItems, totalAmount };
}

export function createCartItemFromProduct(product: unknown, quantity = 1): CartItem | null {
  const prod = product as Record<string, unknown> | null | undefined;
  return normalizeCartItem({
    id: prod?.id,
    name: prod?.name,
    category: prod?.category,
    price: prod?.price,
    image: prod?.image,
    quantity,
  });
}

export interface OrderData {
  items: CartItem[];
}

export function hydrateCartFromOrder(order: unknown): CartItem[] {
  const ord = order as OrderData | null | undefined;
  if (!ord || !Array.isArray(ord.items)) {
    return [];
  }

  return sanitizeCart(
    ord.items.map((item) => ({
      id: item.id,
      name: item.name,
      category: item.category,
      price: item.price,
      image: item.image,
      quantity: item.quantity,
    }))
  );
}
