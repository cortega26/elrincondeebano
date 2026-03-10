import rawProducts from '../data/products.json';
import rawCategories from '../data/categories.json';

export type ProductRecord = {
  name: string;
  description?: string;
  price?: number;
  discount?: number;
  stock?: boolean;
  category: string;
  image_path?: string;
  image_avif_path?: string;
  order?: number;
  is_archived?: boolean;
  [key: string]: unknown;
};

export type ProductCatalog = {
  version?: string;
  last_updated?: string;
  rev?: number;
  products: ProductRecord[];
};

export type CategoryRecord = {
  id: string;
  key: string;
  slug: string;
  display_name?: { default?: string };
  nav_group?: string;
  active?: boolean;
  sort_order?: number;
  description?: string;
};

export type NavGroupRecord = {
  id: string;
  display_name?: { default?: string };
  active?: boolean;
  sort_order?: number;
};

export type CategoryRegistry = {
  nav_groups: NavGroupRecord[];
  categories: CategoryRecord[];
};

export type ProductWithSku = {
  sku: string;
  product: ProductRecord;
};

export type NavGroup = {
  id: string;
  label: string;
  categories: Array<{
    key: string;
    slug: string;
    label: string;
    legacyPath: string;
    modernPath: string;
  }>;
};

const HOME_CATEGORY_PRIORITY = [
  'Despensa',
  'Bebidas',
  'Aguas',
  'Lacteos',
  'SnacksSalados',
  'Limpiezayaseo',
];
const SITE_ORIGIN = 'https://elrincondeebano.com';
const PLACEHOLDER_IMAGE_URL = `${SITE_ORIGIN}/assets/images/web/placeholder.svg`;

const catalog = rawProducts as ProductCatalog;
const categoryRegistry = rawCategories as CategoryRegistry;
let cachedProductsWithSku: ProductWithSku[] | null = null;
let cachedCategoryIndexes:
  | {
      byKey: Map<string, CategoryRecord>;
      bySlug: Map<string, CategoryRecord>;
    }
  | null = null;

function generateStableSku(product: ProductRecord): string {
  const base = `${product.name}-${product.category}`.toLowerCase();
  let hash = 0;
  for (let i = 0; i < base.length; i += 1) {
    hash = (hash << 5) - hash + base.charCodeAt(i);
    hash |= 0;
  }
  return `pid-${Math.abs(hash)}`;
}

function normalizeIdentity(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function normalizeCategoryToken(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim().toLowerCase();
}

function getCategoryIndexes() {
  if (cachedCategoryIndexes) {
    return cachedCategoryIndexes;
  }

  const byKey = new Map<string, CategoryRecord>();
  const bySlug = new Map<string, CategoryRecord>();
  for (const category of categoryRegistry.categories || []) {
    if (!category || typeof category !== 'object') {
      continue;
    }
    if (category.key) {
      byKey.set(normalizeCategoryToken(category.key), category);
    }
    if (category.slug) {
      bySlug.set(normalizeCategoryToken(category.slug), category);
    }
  }

  cachedCategoryIndexes = { byKey, bySlug };
  return cachedCategoryIndexes;
}

export function getProductSku(product: ProductRecord): string {
  const explicitSku = normalizeIdentity((product as { sku?: unknown }).sku);
  if (explicitSku) {
    return explicitSku;
  }

  const explicitId = normalizeIdentity((product as { id?: unknown }).id);
  if (explicitId) {
    return explicitId;
  }

  return generateStableSku(product);
}

export function formatPrice(value: unknown): string {
  const amount = typeof value === 'number' ? value : 0;
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    minimumFractionDigits: 0,
  }).format(amount);
}

function encodePathSegment(segment: string): string {
  if (!segment) {
    return segment;
  }

  try {
    return encodeURIComponent(decodeURIComponent(segment));
  } catch {
    return encodeURIComponent(segment);
  }
}

function encodePathname(pathname: string): string {
  return pathname.split('/').map(encodePathSegment).join('/');
}

export function resolveImageUrl(imagePath: unknown): string {
  if (typeof imagePath !== 'string' || !imagePath.trim()) {
    return PLACEHOLDER_IMAGE_URL;
  }

  const trimmed = imagePath.trim();

  try {
    const url = /^https?:\/\//i.test(trimmed)
      ? new URL(trimmed)
      : new URL(trimmed.replace(/^\/+/, ''), `${SITE_ORIGIN}/`);
    url.pathname = encodePathname(url.pathname);
    return url.toString();
  } catch {
    const normalized = trimmed.replace(/^\/+/, '');
    return `${SITE_ORIGIN}/${encodePathname(normalized)}`;
  }
}

export function getProducts(): ProductRecord[] {
  return [...(catalog.products || [])].filter(
    (product) => product && product.is_archived !== true && product.stock !== false
  );
}

export function getProductsWithSku(): ProductWithSku[] {
  if (cachedProductsWithSku) {
    return cachedProductsWithSku;
  }

  const seenSkuCounts = new Map<string, number>();
  cachedProductsWithSku = getProducts().map((product) => {
    const baseSku = getProductSku(product);
    const seen = seenSkuCounts.get(baseSku) || 0;
    const nextCount = seen + 1;
    seenSkuCounts.set(baseSku, nextCount);
    const sku = nextCount === 1 ? baseSku : `${baseSku}-${nextCount}`;
    return { sku, product };
  });

  return cachedProductsWithSku;
}

export function getHomeHighlightedCategories(): NavGroup['categories'] {
  const categories = getNavigationGroups().flatMap((group) => group.categories || []);
  const bySlug = new Map(categories.map((category) => [String(category.slug || '').toLowerCase(), category]));
  const selected: NavGroup['categories'] = [];
  const seen = new Set<string>();

  HOME_CATEGORY_PRIORITY.forEach((slug) => {
    const match = bySlug.get(String(slug).toLowerCase());
    if (match && !seen.has(match.legacyPath)) {
      selected.push(match);
      seen.add(match.legacyPath);
    }
  });

  categories.forEach((category) => {
    if (selected.length >= 6 || seen.has(category.legacyPath)) return;
    selected.push(category);
    seen.add(category.legacyPath);
  });

  return selected.slice(0, 6);
}

export function getHomeFeaturedDeals(): ProductWithSku[] {
  return [...getProductsWithSku()]
    .filter(({ product }) => Number(product.discount) > 0)
    .sort((a, b) => {
      const priceA = Number(a.product.price) || 0;
      const priceB = Number(b.product.price) || 0;
      const discountA = Number(a.product.discount) || 0;
      const discountB = Number(b.product.discount) || 0;
      const percentA = priceA > 0 ? discountA / priceA : 0;
      const percentB = priceB > 0 ? discountB / priceB : 0;
      if (percentB !== percentA) {
        return percentB - percentA;
      }
      return priceA - priceB;
    })
    .slice(0, 4);
}

export function getHomeQuickPicks(): ProductWithSku[] {
  const products = getProductsWithSku();
  const selected: ProductWithSku[] = [];
  const seenCategories = new Set<string>();

  HOME_CATEGORY_PRIORITY.forEach((categoryKey) => {
    const match = products.find(
      ({ product }) => product.category === categoryKey && Number(product.discount || 0) <= 0
    );
    if (match && !seenCategories.has(match.product.category)) {
      selected.push(match);
      seenCategories.add(match.product.category);
    }
  });

  products.forEach((item) => {
    if (selected.length >= 4) return;
    if (Number(item.product.discount || 0) > 0) return;
    if (seenCategories.has(item.product.category)) return;
    selected.push(item);
    seenCategories.add(item.product.category);
  });

  return selected.slice(0, 4);
}

export function getCategoryKeys(): string[] {
  return getActiveCategories().map((category) => category.key);
}

export function getProductsByCategory(categoryKey: string): ProductWithSku[] {
  return getProductsWithSku().filter(({ product }) => product.category === categoryKey);
}

export function getProductBySku(sku: string): ProductWithSku | undefined {
  return getProductsWithSku().find((item) => item.sku === sku);
}

export function getCategoryByKey(categoryKey: string): CategoryRecord | undefined {
  const normalized = normalizeCategoryToken(categoryKey);
  if (!normalized) {
    return undefined;
  }
  return getCategoryIndexes().byKey.get(normalized);
}

export function getCategoryBySlug(categorySlug: string): CategoryRecord | undefined {
  const normalized = normalizeCategoryToken(categorySlug);
  if (!normalized) {
    return undefined;
  }
  return getCategoryIndexes().bySlug.get(normalized);
}

export function resolveCategoryParamToKey(categoryParam: string): string | null {
  const bySlug = getCategoryBySlug(categoryParam);
  if (bySlug) {
    return bySlug.key;
  }
  const byKey = getCategoryByKey(categoryParam);
  return byKey?.key || null;
}

export function getCategoryLabel(categoryKey: string): string {
  const category = getCategoryByKey(categoryKey);
  return category?.display_name?.default || categoryKey;
}

export function getCategoryDescription(categoryKey: string): string {
  const category = getCategoryByKey(categoryKey);
  const explicit = category?.description?.trim();
  if (explicit) {
    return explicit;
  }
  const label = getCategoryLabel(categoryKey);
  return `Explora nuestra selección de ${label} en El Rincón de Ébano.`;
}

export function getCategorySlug(categoryKey: string): string {
  const category = getCategoryByKey(categoryKey);
  if (category?.slug?.trim()) {
    return category.slug;
  }
  return categoryKey;
}

export function getLegacyCategoryPath(categoryKey: string): string {
  const slug = getCategorySlug(categoryKey);
  return `/pages/${slug}.html`;
}

export function getModernCategoryPath(categoryKey: string): string {
  const slug = getCategorySlug(categoryKey);
  return `/c/${slug}/`;
}

export function getActiveCategories(): CategoryRecord[] {
  return [...(categoryRegistry.categories || [])]
    .filter((category) => category.active !== false)
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
}

export function getCategoryRouteParams(): Array<{ param: string; categoryKey: string }> {
  const seen = new Set<string>();
  const routes: Array<{ param: string; categoryKey: string }> = [];

  for (const category of getActiveCategories()) {
    const slug = normalizeIdentity(category.slug);
    if (slug) {
      const slugRoute = slug.toLowerCase();
      if (!seen.has(slugRoute)) {
        routes.push({ param: slugRoute, categoryKey: category.key });
        seen.add(slugRoute);
      }
    }

    const key = normalizeIdentity(category.key);
    if (key && !seen.has(key)) {
      routes.push({ param: key, categoryKey: category.key });
      seen.add(key);
    }
  }

  return routes;
}

export function getNavigationGroups(): NavGroup[] {
  const activeCategories = getActiveCategories();

  const groups = categoryRegistry.nav_groups
    .filter((group) => group.active !== false)
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
    .map((group) => {
      const categories = activeCategories
        .filter((category) => category.nav_group === group.id)
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
        .map((category) => ({
          key: category.key,
          slug: getCategorySlug(category.key),
          label: category.display_name?.default || category.key,
          legacyPath: getLegacyCategoryPath(category.key),
          modernPath: getModernCategoryPath(category.key),
        }));

      return {
        id: group.id,
        label: group.display_name?.default || group.id,
        categories,
      };
    })
    .filter((group) => group.categories.length > 0);

  return groups;
}

export const catalogMeta = {
  version: catalog.version || null,
  lastUpdated: catalog.last_updated || null,
};
