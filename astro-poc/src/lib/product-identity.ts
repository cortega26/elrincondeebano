export type ProductIdentityInput = {
  sku?: unknown;
  id?: unknown;
  name?: unknown;
  category?: unknown;
};

export function normalizeIdentity(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

export function generateStableSku(product: ProductIdentityInput): string {
  const base = `${String(product?.name || '')}-${String(product?.category || '')}`.toLowerCase();
  let hash = 0;
  for (let index = 0; index < base.length; index += 1) {
    hash = (hash << 5) - hash + base.charCodeAt(index);
    hash |= 0;
  }
  return `pid-${Math.abs(hash)}`;
}

export function getProductSku(product: ProductIdentityInput): string {
  const explicitSku = normalizeIdentity(product?.sku);
  if (explicitSku) {
    return explicitSku;
  }

  const explicitId = normalizeIdentity(product?.id);
  if (explicitId) {
    return explicitId;
  }

  return generateStableSku(product);
}
