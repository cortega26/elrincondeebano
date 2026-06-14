import { describe, expect, it } from 'vitest';
import {
  normalizeIdentity,
  generateStableSku,
  getProductSku,
} from '../astro-poc/src/lib/product-identity.ts';

describe('normalizeIdentity', () => {
  it('trims a valid string', () => {
    expect(normalizeIdentity('  abarrotes  ')).toBe('abarrotes');
  });

  it('returns null for an empty string after trim', () => {
    expect(normalizeIdentity('   ')).toBeNull();
  });

  it('returns null for a number', () => {
    expect(normalizeIdentity(123)).toBeNull();
  });

  it('returns null for null', () => {
    expect(normalizeIdentity(null)).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(normalizeIdentity(undefined)).toBeNull();
  });
});

describe('generateStableSku', () => {
  it('produces the same sku for the same input (deterministic)', () => {
    const product = { name: 'Arroz', category: 'Despensa' };
    expect(generateStableSku(product)).toBe(generateStableSku(product));
  });

  it('produces different skus for different products', () => {
    const skuA = generateStableSku({ name: 'Arroz', category: 'Despensa' });
    const skuB = generateStableSku({ name: 'Fideos', category: 'Despensa' });
    expect(skuA).not.toBe(skuB);
  });

  it('handles missing name and category gracefully', () => {
    const sku = generateStableSku({});
    expect(sku).toMatch(/^pid-\d+$/);
  });

  it('is case-insensitive', () => {
    const skuUpper = generateStableSku({ name: 'ARROZ', category: 'DESPENSA' });
    const skuLower = generateStableSku({ name: 'arroz', category: 'despensa' });
    expect(skuUpper).toBe(skuLower);
  });
});

describe('getProductSku', () => {
  it('uses explicit sku when provided', () => {
    const product = { sku: 'EXP-001', name: 'Arroz', category: 'Despensa' };
    expect(getProductSku(product)).toBe('EXP-001');
  });

  it('uses id when no sku is available', () => {
    const product = { id: 'ID-001', name: 'Arroz', category: 'Despensa' };
    expect(getProductSku(product)).toBe('ID-001');
  });

  it('generates stable sku when no sku or id is available', () => {
    const product = { name: 'Arroz', category: 'Despensa' };
    const sku = getProductSku(product);
    expect(sku).toMatch(/^pid-\d+$/);
    expect(getProductSku(product)).toBe(sku); // deterministic
  });

  it('prefers sku over id', () => {
    const product = { sku: 'SKU-001', id: 'ID-001', name: 'Arroz', category: 'Despensa' };
    expect(getProductSku(product)).toBe('SKU-001');
  });
});
