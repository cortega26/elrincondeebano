import { describe, expect, it } from 'vitest';
import {
  getProducts,
  getActiveCategories,
  getCategoryByKey,
  getHomeFeaturedDeals,
  getStorefrontBundles,
  getNavigationGroups,
  getProductByReference,
  getProductsByReferences,
} from '../astro-poc/src/lib/catalog.ts';
import { formatCurrency } from '../astro-poc/src/lib/formatting.ts';

describe('getProducts', () => {
  it('returns a non-empty array of products', () => {
    const products = getProducts();
    expect(Array.isArray(products)).toBe(true);
    expect(products.length).toBeGreaterThan(0);
  });

  it('does not include archived products', () => {
    const products = getProducts();
    const archived = products.filter((p) => p.is_archived === true);
    expect(archived.length).toBe(0);
  });

  it('does not include out-of-stock products', () => {
    const products = getProducts();
    const noStock = products.filter((p) => p.stock === false);
    expect(noStock.length).toBe(0);
  });

  it('each product has a name and category', () => {
    const products = getProducts();
    products.forEach((p) => {
      expect(p.name).toBeTruthy();
      expect(p.category).toBeTruthy();
    });
  });
});

describe('getActiveCategories', () => {
  it('returns a non-empty array', () => {
    const categories = getActiveCategories();
    expect(Array.isArray(categories)).toBe(true);
    expect(categories.length).toBeGreaterThan(0);
  });

  it('does not include categories marked inactive', () => {
    const categories = getActiveCategories();
    const inactive = categories.filter((c) => c.active === false);
    expect(inactive.length).toBe(0);
  });
});

describe('getCategoryByKey', () => {
  it('finds an existing category by key', () => {
    const category = getCategoryByKey('Despensa');
    expect(category).toBeDefined();
    expect(category?.key).toBe('Despensa');
  });

  it('is case-insensitive', () => {
    const category = getCategoryByKey('despensa');
    expect(category).toBeDefined();
    expect(category?.key).toBe('Despensa');
  });

  it('trims whitespace from the key', () => {
    const category = getCategoryByKey('  Despensa  ');
    expect(category).toBeDefined();
    expect(category?.key).toBe('Despensa');
  });

  it('returns undefined for a non-existent key', () => {
    const category = getCategoryByKey('NoExiste');
    expect(category).toBeUndefined();
  });
});

describe('getHomeFeaturedDeals', () => {
  it('returns at most 4 products', () => {
    const deals = getHomeFeaturedDeals();
    expect(Array.isArray(deals)).toBe(true);
    expect(deals.length).toBeLessThanOrEqual(4);
  });

  it('each deal has a discount greater than 0', () => {
    const deals = getHomeFeaturedDeals();
    deals.forEach(({ product }) => {
      expect(Number(product.discount)).toBeGreaterThan(0);
    });
  });
});

describe('getStorefrontBundles', () => {
  it('returns a non-empty array', () => {
    const bundles = getStorefrontBundles();
    expect(Array.isArray(bundles)).toBe(true);
    expect(bundles.length).toBeGreaterThan(0);
  });

  it('each bundle has a totalPrice > 0', () => {
    const bundles = getStorefrontBundles();
    bundles.forEach((bundle) => {
      expect(bundle.totalPrice).toBeGreaterThan(0);
      expect(bundle.itemsResolved.length).toBeGreaterThan(0);
    });
  });
});

describe('getNavigationGroups', () => {
  it('returns a non-empty array of groups', () => {
    const groups = getNavigationGroups();
    expect(Array.isArray(groups)).toBe(true);
    expect(groups.length).toBeGreaterThan(0);
  });

  it('each group has an id, label, and categories array', () => {
    const groups = getNavigationGroups();
    groups.forEach((group) => {
      expect(group.id).toBeTruthy();
      expect(group.label).toBeTruthy();
      expect(Array.isArray(group.categories)).toBe(true);
    });
  });

  it('each category in a group has key, slug, label, legacyPath, and modernPath', () => {
    const groups = getNavigationGroups();
    groups.forEach((group) => {
      group.categories.forEach((cat) => {
        expect(cat.key).toBeTruthy();
        expect(cat.slug).toBeTruthy();
        expect(cat.label).toBeTruthy();
        expect(cat.legacyPath).toMatch(/^\/pages\//);
        expect(cat.modernPath).toMatch(/^\/.*\/$/);
      });
    });
  });
});

describe('getProductByReference', () => {
  it('finds an existing product by category and name', () => {
    const product = getProductByReference({ category: 'Bebidas', name: 'Coca-Cola 2L' });
    expect(product).toBeDefined();
    expect(product?.product.name).toBe('Coca-Cola 2L');
    expect(product?.product.category).toBe('Bebidas');
  });

  it('returns undefined for a non-existent product', () => {
    const product = getProductByReference({ category: 'NoExiste', name: 'NoExiste' });
    expect(product).toBeUndefined();
  });
});

describe('getProductsByReferences', () => {
  it('resolves multiple references without duplicates', () => {
    const refs = [
      { category: 'Bebidas', name: 'Coca-Cola 2L' },
      { category: 'Limpiezayaseo', name: 'Toalla Papel Nova Clásica' },
    ];
    const products = getProductsByReferences(refs);
    expect(products.length).toBe(2);
    expect(products[0].sku).toBeTruthy();
    expect(products[1].sku).toBeTruthy();
  });

  it('deduplicates when the same reference appears twice', () => {
    const refs = [
      { category: 'Bebidas', name: 'Coca-Cola 2L' },
      { category: 'Bebidas', name: 'Coca-Cola 2L' },
    ];
    const products = getProductsByReferences(refs);
    expect(products.length).toBe(1);
  });
});

describe('formatCurrency', () => {
  it('formats a number as CLP currency', () => {
    const formatted = formatCurrency(1990);
    expect(formatted).toContain('$');
    expect(formatted).toContain('1');
  });

  it('formats zero when no value is provided', () => {
    const formatted = formatCurrency(undefined);
    expect(formatted).toContain('$');
    expect(formatted).toContain('0');
  });
});
