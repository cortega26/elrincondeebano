/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchProducts } from '../src/js/script.mjs';

describe('fetchProducts', () => {
    let mockFetch;

    beforeEach(() => {
        // Reset global state
        vi.restoreAllMocks();

        // Mock basic globals
        global.window.__PRODUCT_DATA__ = undefined;

        // Mock console to avoid noise
        vi.spyOn(console, 'log').mockImplementation(() => { });
        vi.spyOn(console, 'warn').mockImplementation(() => { });
        vi.spyOn(console, 'error').mockImplementation(() => { });

        // Mock localStorage
        const store = new Map();
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(key => store.get(key) || null);
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation((key, val) => store.set(key, String(val)));
        vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(key => store.delete(key));
        vi.spyOn(Storage.prototype, 'clear').mockImplementation(() => store.clear());

        // Mock global fetch
        // Mock global fetch
        mockFetch = vi.fn();
        vi.stubGlobal('fetch', mockFetch);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        delete global.window.__PRODUCT_DATA__;
    });

    it('successful fetch without productDataVersion', async () => {
        mockFetch.mockResolvedValue({
            ok: true,
            json: async () => ({ products: [] }),
            headers: new Headers({ 'content-type': 'application/json' })
        });

        const products = await fetchProducts();

        expect(products).toEqual([]);
        expect(mockFetch).toHaveBeenCalledWith(expect.stringMatching(/\/data\/product_data\.json/), expect.anything());
        expect(window.__PRODUCT_DATA__).toBeDefined();
        expect(window.__PRODUCT_DATA__.products).toEqual([]);
    });

    it('successful fetch with productDataVersion', async () => {
        localStorage.setItem('productDataVersion', '123');
        mockFetch.mockResolvedValue({
            ok: true,
            json: async () => ({ products: [] }),
            headers: new Headers({ 'content-type': 'application/json' })
        });

        await fetchProducts();

        expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('v=123'), expect.anything());
    });

    it('non-OK response throws ProductDataError', async () => {
        mockFetch.mockResolvedValue({
            ok: false,
            status: 500,
            json: async () => ({})
        });

        await expect(fetchProducts()).rejects.toThrow(/HTTP error/);
    });

    it('invalid JSON throws ProductDataError', async () => {
        mockFetch.mockResolvedValue({
            ok: true,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => { throw new SyntaxError('Invalid JSON'); }
        });

        await expect(fetchProducts()).rejects.toThrow();
    });

    it('network failure throws ProductDataError', async () => {
        mockFetch.mockRejectedValue(new Error('Network error'));
        await expect(fetchProducts()).rejects.toThrow();
    });

    it('retries then succeeds', async () => {
        let callCount = 0;
        mockFetch.mockImplementation((url) => {
            callCount++;
            if (callCount === 1) return Promise.resolve({ ok: false, status: 500 });
            return Promise.resolve({
                ok: true,
                json: async () => ({ products: [] }),
                headers: new Headers({ 'content-type': 'application/json' })
            });
        });

        const products = await fetchProducts();
        expect(products).toEqual([]);
        expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('uses inline dataset when available', async () => {
        // Setup inline data
        const inlineData = {
            version: 'inline-1',
            totalProducts: 1,
            products: [], // script.mjs expects products here directly or in initialProducts
            initialProducts: [{ name: 'Test', price: 100 }]
        };

        // Mock getElementById to return inline script
        vi.spyOn(document, 'getElementById').mockImplementation(id => {
            if (id === 'product-data') return { textContent: JSON.stringify(inlineData) };
            return null;
        });

        localStorage.setItem('productDataVersion', 'inline-1');

        // Ensure fetch fails if called (should not be called for data, but might be for verification if logic differs)
        // Actually logic: if version matches and we have inline data, we might skip fetch or use it as fallback.
        // Let's force fetch fail to prove we used inline
        mockFetch.mockRejectedValue(new Error('Offline'));

        const products = await fetchProducts();
        // Logic in script.mjs: if inline version matches local version, it might use it.
        // Based on legacy test: it expects 1 product.
        expect(products).toHaveLength(1);
        expect(window.__PRODUCT_DATA__.isPartial).toBe(true);
    });
});
