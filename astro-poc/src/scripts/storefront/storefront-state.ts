export const MAX_CART_ITEM_QTY = 50;

export interface CartItem {
  id: string;
  name: string;
  category: string;
  price: number;
  discount: number;
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
    discount: parseNumber(itemObj?.discount, 0),
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
  const totalAmount = normalizedCart.reduce((total, item) => {
    const effectivePrice = Math.max(0, parseNumber(item.price, 0) - parseNumber(item.discount, 0));
    return total + effectivePrice * clampQty(item.quantity);
  }, 0);

  return { totalItems, totalAmount };
}

export function createCartItemFromProduct(product: unknown, quantity = 1): CartItem | null {
  const prod = product as Record<string, unknown> | null | undefined;
  return normalizeCartItem({
    id: prod?.id,
    name: prod?.name,
    category: prod?.category,
    price: prod?.price,
    discount: prod?.discount,
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
      discount: item.discount,
      image: item.image,
      quantity: item.quantity,
    }))
  );
}

/**
 * Shared-cart URL payload contract. The hash is untrusted input, so links
 * carry identity and quantity only; display and pricing fields are rehydrated
 * from the current catalog on load (plan 026).
 */
export const SHARED_CART_VERSION = 1;

export interface SharedCartItem {
  id: string;
  quantity: number;
}

export interface SharedCartPayload {
  version: number;
  items: SharedCartItem[];
}

export function toSharedCartPayload(cart: unknown): SharedCartPayload | null {
  const merged = new Map<string, number>();
  for (const item of sanitizeCart(cart)) {
    const id = normalizeId(item.id);
    if (!id) {
      continue;
    }
    const quantity = clampQty((merged.get(id) ?? 0) + clampQty(item.quantity));
    if (quantity > 0) {
      merged.set(id, quantity);
    }
  }
  if (merged.size === 0) {
    return null;
  }
  return {
    version: SHARED_CART_VERSION,
    items: [...merged.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([id, quantity]) => ({ id, quantity })),
  };
}

export function parseSharedCartPayload(payload: unknown): SharedCartItem[] {
  let rawItems: unknown;
  if (Array.isArray(payload)) {
    // Legacy link: full cart items were stored; only identity and quantity
    // are trusted. Every other legacy field (name/price/discount/image) is ignored.
    rawItems = payload;
  } else {
    const obj = payload as Record<string, unknown> | null | undefined;
    if (!obj || typeof obj !== 'object') {
      return [];
    }
    if (obj.version !== SHARED_CART_VERSION) {
      return [];
    }
    if (!Array.isArray(obj.items)) {
      return [];
    }
    rawItems = obj.items;
  }

  const seen = new Set<string>();
  const items: SharedCartItem[] = [];
  for (const raw of rawItems as unknown[]) {
    const entry = raw as Record<string, unknown> | null | undefined;
    const id = normalizeId(entry?.id);
    const quantity = clampQty(entry?.quantity);
    if (!id || quantity <= 0 || seen.has(id)) {
      continue;
    }
    seen.add(id);
    items.push({ id, quantity });
  }
  return items;
}

export function hydrateSharedCart(
  payload: unknown,
  resolveProductById: (id: string) => unknown
): CartItem[] {
  const entries = parseSharedCartPayload(payload);
  if (entries.length === 0 || typeof resolveProductById !== 'function') {
    return [];
  }

  const items: CartItem[] = [];
  for (const { id, quantity } of entries) {
    const product = resolveProductById(id) as Record<string, unknown> | null | undefined;
    if (!product || product.stock === false) {
      continue;
    }
    const item = createCartItemFromProduct(product, quantity);
    if (item) {
      items.push(item);
    }
  }
  return items;
}
