import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import rawProducts from '../data/products.json';
import rawCategories from '../data/categories.json';
import rawStorefrontExperience from '../data/storefront-experience.json';
import rawStorefrontBundles from '../data/storefront-bundles.json';

export type ProductImageVariant = {
  src?: string;
  url?: string;
  width?: number;
};

export type ProductRecord = {
  name: string;
  description?: string;
  price?: number;
  discount?: number;
  stock?: boolean;
  category: string;
  image_path?: string;
  image_avif_path?: string;
  image_variants?: ProductImageVariant[];
  thumbnail_path?: string;
  thumbnail_variants?: ProductImageVariant[];
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

export type ProductReference = {
  category: string;
  name: string;
};

export type StorefrontTrustItem = {
  label: string;
  value: string;
};

export type StorefrontBundleRecord = {
  id: string;
  title: string;
  description: string;
  items: ProductReference[];
};

export type StorefrontCompanionRule = {
  sourceCategories: string[];
  targets: ProductReference[];
};

export type StorefrontExperience = {
  trustBar: {
    highlights: StorefrontTrustItem[];
    statusItems: StorefrontTrustItem[];
  };
  home: {
    primaryCategories: string[];
    secondaryCategories: string[];
    fallbackQuickPicks: ProductReference[];
    featuredStaples: ProductReference[];
  };
  bundles: StorefrontBundleRecord[];
  companionRules: StorefrontCompanionRule[];
};

export type StorefrontBundle = StorefrontBundleRecord & {
  itemsResolved: ProductWithSku[];
  totalPrice: number;
};

export type ResponsiveImageSource = {
  src: string;
  srcset?: string;
  sizes?: string;
};

const PLACEHOLDER_IMAGE_URL = '/assets/images/web/placeholder.svg';
const DEFAULT_PRODUCT_CARD_WIDTHS = Object.freeze([200, 320, 400]);
const DEFAULT_PRODUCT_DETAIL_WIDTHS = Object.freeze([320, 400, 640]);
const PRODUCT_ASSET_PREFIX = 'assets/images/';
const PRODUCT_VARIANT_PREFIX = 'assets/images/variants';
const VARIANT_EXISTS_CACHE = new Map<string, boolean>();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../..');
const PUBLIC_ROOT = path.join(PROJECT_ROOT, 'public');

export const PRODUCT_CARD_IMAGE_SIZES =
  '(max-width: 575px) calc(50vw - 1.25rem), (max-width: 991px) calc(33vw - 1.5rem), (max-width: 1399px) calc(25vw - 1.75rem), 280px';
export const PRODUCT_DETAIL_IMAGE_SIZES =
  '(max-width: 767px) calc(100vw - 2rem), (max-width: 991px) 44vw, 38vw';

const catalog = rawProducts as ProductCatalog;
const categoryRegistry = rawCategories as CategoryRegistry;
const storefrontExperience = {
  ...(rawStorefrontExperience as Omit<StorefrontExperience, 'bundles'>),
  bundles: rawStorefrontBundles as StorefrontBundleRecord[],
} as StorefrontExperience;
let cachedProductsWithSku: ProductWithSku[] | null = null;
let cachedCategoryIndexes: {
  byKey: Map<string, CategoryRecord>;
  bySlug: Map<string, CategoryRecord>;
} | null = null;

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

function normalizeAssetPath(assetPath: unknown): string {
  if (typeof assetPath !== 'string') {
    return '';
  }

  return assetPath.trim().replace(/^\/+/, '');
}

export function resolveImageUrl(imagePath: unknown): string {
  const trimmed = normalizeAssetPath(imagePath);
  if (!trimmed) {
    return PLACEHOLDER_IMAGE_URL;
  }

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      url.pathname = encodePathname(url.pathname);
      return url.toString();
    } catch {
      return trimmed;
    }
  }

  try {
    return encodePathname(`/${trimmed.replace(/^\/+/, '')}`);
  } catch {
    const normalized = trimmed.replace(/^\/+/, '');
    return `/${encodePathname(normalized).replace(/^\/+/, '')}`;
  }
}

function buildVariantAssetPath(imagePath: unknown, width: number): string {
  const normalized = normalizeAssetPath(imagePath);
  if (!normalized || !normalized.startsWith(PRODUCT_ASSET_PREFIX)) {
    return '';
  }

  const relativePath = normalized.slice(PRODUCT_ASSET_PREFIX.length);
  return `${PRODUCT_VARIANT_PREFIX}/w${width}/images/${relativePath}`;
}

function publicAssetExists(assetPath: string): boolean {
  const normalized = normalizeAssetPath(assetPath);
  if (!normalized) {
    return false;
  }

  if (VARIANT_EXISTS_CACHE.has(normalized)) {
    return VARIANT_EXISTS_CACHE.get(normalized) || false;
  }

  const exists = existsSync(path.join(PUBLIC_ROOT, normalized));
  VARIANT_EXISTS_CACHE.set(normalized, exists);
  return exists;
}

function getResponsiveVariantSet(
  imagePath: unknown,
  widths: readonly number[]
): ProductImageVariant[] {
  const normalized = normalizeAssetPath(imagePath);
  if (!normalized) {
    return [];
  }

  return widths
    .map((width) => {
      const variantPath = buildVariantAssetPath(normalized, width);
      if (!variantPath || !publicAssetExists(variantPath)) {
        return null;
      }
      return { src: resolveImageUrl(variantPath), width };
    })
    .filter(Boolean) as ProductImageVariant[];
}

function buildSrcset(variants: ProductImageVariant[]): string | undefined {
  const srcset = variants
    .map((variant) => {
      const src = typeof variant.src === 'string' ? variant.src : variant.url;
      const width = variant.width;
      if (!src || typeof width !== 'number') {
        return '';
      }
      return `${src} ${width}w`;
    })
    .filter(Boolean)
    .join(', ');

  return srcset || undefined;
}

export function getResponsiveImageSource(
  imagePath: unknown,
  {
    widths = DEFAULT_PRODUCT_CARD_WIDTHS,
    sizes = PRODUCT_CARD_IMAGE_SIZES,
  }: {
    widths?: readonly number[];
    sizes?: string;
  } = {}
): ResponsiveImageSource {
  const variants = getResponsiveVariantSet(imagePath, widths);
  const srcset = buildSrcset(variants);
  const src = variants[0]?.src || resolveImageUrl(imagePath);

  return {
    src,
    srcset,
    sizes: srcset ? sizes : undefined,
  };
}

export function getProductCardImageSource(imagePath: unknown): ResponsiveImageSource {
  return getResponsiveImageSource(imagePath, {
    widths: DEFAULT_PRODUCT_CARD_WIDTHS,
    sizes: PRODUCT_CARD_IMAGE_SIZES,
  });
}

export function getProductDetailImageSource(imagePath: unknown): ResponsiveImageSource {
  return getResponsiveImageSource(imagePath, {
    widths: DEFAULT_PRODUCT_DETAIL_WIDTHS,
    sizes: PRODUCT_DETAIL_IMAGE_SIZES,
  });
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

function productReferenceKey(reference: ProductReference): string {
  return `${normalizeCategoryToken(reference.category)}::${normalizeSearchToken(reference.name)}`;
}

function normalizeSearchToken(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function getProductReferenceMap() {
  return new Map(
    getProductsWithSku().map((item) => [
      productReferenceKey({ category: item.product.category, name: item.product.name }),
      item,
    ])
  );
}

export function getStorefrontExperience(): StorefrontExperience {
  return storefrontExperience;
}

export function getStorefrontTrustItems(): StorefrontTrustItem[] {
  return storefrontExperience.trustBar.highlights || [];
}

export function getStorefrontStatusItems(): StorefrontTrustItem[] {
  return storefrontExperience.trustBar.statusItems || [];
}

export function getProductByReference(reference: ProductReference): ProductWithSku | undefined {
  return getProductReferenceMap().get(productReferenceKey(reference));
}

export function getProductsByReferences(references: ProductReference[]): ProductWithSku[] {
  const seen = new Set<string>();
  const resolved: ProductWithSku[] = [];
  references.forEach((reference) => {
    const product = getProductByReference(reference);
    if (!product || seen.has(product.sku)) {
      return;
    }
    seen.add(product.sku);
    resolved.push(product);
  });
  return resolved;
}

function resolveHomeCategories(categoryKeys: string[]): NavGroup['categories'] {
  const categories = getNavigationGroups().flatMap((group) => group.categories || []);
  const byKey = new Map(
    categories.map((category) => [normalizeCategoryToken(category.key), category])
  );

  return categoryKeys
    .map((categoryKey) => byKey.get(normalizeCategoryToken(categoryKey)))
    .filter(Boolean) as NavGroup['categories'];
}

export function getHomePrimaryCategories(): NavGroup['categories'] {
  return resolveHomeCategories(storefrontExperience.home.primaryCategories);
}

export function getHomeSecondaryCategories(): NavGroup['categories'] {
  return resolveHomeCategories(storefrontExperience.home.secondaryCategories);
}

export function getHomepageCatalogProducts(): ProductWithSku[] {
  const secondary = new Set(
    storefrontExperience.home.secondaryCategories.map((categoryKey) =>
      normalizeCategoryToken(categoryKey)
    )
  );

  return getProductsWithSku().filter(
    ({ product }) => !secondary.has(normalizeCategoryToken(product.category))
  );
}

export function getHomeHighlightedCategories(): NavGroup['categories'] {
  return getHomePrimaryCategories();
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
  return getProductsByReferences(storefrontExperience.home.fallbackQuickPicks);
}

export function getHomeFeaturedStaples(): ProductWithSku[] {
  return getProductsByReferences(storefrontExperience.home.featuredStaples);
}

export function getStorefrontBundles(): StorefrontBundle[] {
  return (storefrontExperience.bundles || []).map((bundle) => {
    const itemsResolved = getProductsByReferences(bundle.items);
    return {
      ...bundle,
      itemsResolved,
      totalPrice: itemsResolved.reduce(
        (sum, item) =>
          sum +
          Math.max(
            (typeof item.product.price === 'number' ? item.product.price : 0) -
              (typeof item.product.discount === 'number' ? item.product.discount : 0),
            0
          ),
        0
      ),
    };
  });
}

export function getStorefrontCompanionRules(): StorefrontCompanionRule[] {
  return storefrontExperience.companionRules || [];
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
  return `/${slug}/`;
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
