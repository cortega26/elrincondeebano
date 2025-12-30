import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../src/js/utils/logger.mts', () => ({
  log: vi.fn(),
  createCorrelationId: () => 'corr-id',
}));

vi.mock('../src/js/modules/ui-components.mjs', () => ({
  showErrorMessage: vi.fn(),
}));

import { log } from '../src/js/utils/logger.mts';

const loadProductDataManager = async () => {
  vi.resetModules();
  return import('../src/js/modules/product-data-manager.mjs');
};

describe('product-data-manager', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    delete window.__PRODUCT_DATA__;
    vi.clearAllMocks();
  });

  it('normalizeString removes accents and punctuation', async () => {
    const { normalizeString } = await loadProductDataManager();
    expect(normalizeString('Cafe con leche!')).toBe('cafeconleche');
    expect(normalizeString('Café con leche!')).toBe('cafeconleche');
  });

  it('transformProduct fills defaults and sanitizes strings', async () => {
    const { transformProduct } = await loadProductDataManager();
    const result = transformProduct(
      { name: '<b>Pan</b>', description: '<script>x</script>' },
      0
    );
    expect(result.id).toMatch(/^pid-/);
    expect(result.name).not.toContain('<');
    expect(result.description).not.toContain('<');
    expect(result.category).toBe('General');
    expect(result.categoryKey).toBe('general');
  });

  it('writeSharedProductData preserves existing payload when versions match', async () => {
    const { writeSharedProductData, getSharedProductData } = await loadProductDataManager();
    const first = writeSharedProductData([{ id: '1' }], { version: 'v1' });
    const second = writeSharedProductData([{ id: '2' }], { version: 'v1' });

    expect(second).toEqual(first);
    expect(getSharedProductData().products).toEqual([{ id: '1' }]);
  });

  it('ensureSharedProductData reuses existing data for matching versions', async () => {
    const { writeSharedProductData, ensureSharedProductData } = await loadProductDataManager();
    const first = writeSharedProductData([{ id: '1' }], { version: 'v2' });
    const next = ensureSharedProductData([{ id: '3' }], { version: 'v2' });

    expect(next).toEqual(first);
  });

  it('overwriteSharedProductData replaces payload when forced', async () => {
    const { writeSharedProductData, overwriteSharedProductData, getSharedProductData } =
      await loadProductDataManager();
    writeSharedProductData([{ id: '1' }], { version: 'v1' });
    const replaced = overwriteSharedProductData([{ id: '2' }], { version: 'v2' });

    expect(replaced.products).toEqual([{ id: '2' }]);
    expect(getSharedProductData().version).toBe('v2');
  });

  it('parseInlineProductData accepts products and initialProducts', async () => {
    const { parseInlineProductData } = await loadProductDataManager();
    const script = document.createElement('script');
    script.id = 'product-data';
    script.type = 'application/json';
    script.textContent = JSON.stringify({ version: '1', products: [{ name: 'A' }] });
    document.body.appendChild(script);

    const parsed = parseInlineProductData();
    expect(parsed.initialProducts).toEqual([{ name: 'A' }]);
  });

  it('parseInlineProductData logs on invalid JSON', async () => {
    const { parseInlineProductData } = await loadProductDataManager();
    const script = document.createElement('script');
    script.id = 'product-data';
    script.type = 'application/json';
    script.textContent = '{invalid';
    document.body.appendChild(script);

    const parsed = parseInlineProductData();
    expect(parsed).toBeNull();
    expect(log).toHaveBeenCalledWith(
      'warn',
      'inline_product_parse_failure',
      expect.objectContaining({ error: expect.any(String) })
    );
  });

  it('hydrateSharedProductDataFromInline writes shared payload', async () => {
    const { hydrateSharedProductDataFromInline } = await loadProductDataManager();
    const script = document.createElement('script');
    script.id = 'product-data';
    script.type = 'application/json';
    script.textContent = JSON.stringify({
      initialProducts: [{ name: 'Test' }],
      version: 'inline-1',
    });
    document.body.appendChild(script);

    const payload = hydrateSharedProductDataFromInline();
    expect(payload).toBeTruthy();
    expect(payload.source).toBe('inline');
    expect(payload.products).toHaveLength(1);
    expect(window.__PRODUCT_DATA__).toBeTruthy();
  });
});
