// Plan 173: pagination loops for the reorder path — the archived fetch and
// the clamped-view fetch must page to exhaustion (server clamps limit at
// 200), or reorder silently 409s past 200 archived / is dead past 500 total.
import { describe, expect, it, vi } from 'vitest';
import {
  fetchAllProductIds,
  reorderWithFullCatalog,
} from '../../src/web/app/routes/ProductsPage.tsx';
import type { ContentManagerClient } from '../../src/web/api/client.ts';

function archivedPage(start: number, count: number): Array<{ id: string }> {
  return Array.from({ length: count }, (_, i) => ({ id: `arch-${start + i}` }));
}

function mockClient(pages: Record<number, Array<{ id: string }>>) {
  const calls: Array<{ page?: number; limit?: number }> = [];
  const getProducts = vi.fn(async (params?: { page?: number; limit?: number }) => {
    calls.push({ page: params?.page, limit: params?.limit });
    return { items: pages[params?.page ?? 1] ?? [], total: 999 };
  });
  const reorderProducts = vi.fn(async () => undefined);
  const client = { getProducts, reorderProducts } as unknown as ContentManagerClient;
  return { client, getProducts, reorderProducts, calls };
}

describe('fetchAllProductIds', () => {
  it('collects all ids across pages and stops on the short page', async () => {
    const { client, calls } = mockClient({ 1: archivedPage(0, 200), 2: archivedPage(200, 50) });
    const ids = await fetchAllProductIds(client, { archived: true });
    expect(ids).toHaveLength(250);
    expect(ids[0]).toBe('arch-0');
    expect(ids[249]).toBe('arch-249');
    expect(calls.map((c) => c.page)).toEqual([1, 2]);
  });

  it('handles exact multiples with one terminal empty fetch', async () => {
    const { client, calls } = mockClient({ 1: archivedPage(0, 200), 2: archivedPage(200, 200) });
    const ids = await fetchAllProductIds(client, { archived: true });
    expect(ids).toHaveLength(400);
    expect(calls.map((c) => c.page)).toEqual([1, 2, 3]);
  });

  it('passes filter params through on every page', async () => {
    const { client, getProducts } = mockClient({ 1: [{ id: 'x' }] });
    const ids = await fetchAllProductIds(client, { q: 'arroz', archived: false });
    expect(ids).toEqual(['x']);
    expect(getProducts).toHaveBeenCalledWith(
      expect.objectContaining({ q: 'arroz', archived: false, page: 1, limit: 200 })
    );
  });
});

describe('reorderWithFullCatalog', () => {
  it('appends all archived ids in server order after the visible ids', async () => {
    const { client, reorderProducts } = mockClient({
      1: archivedPage(0, 200),
      2: archivedPage(200, 50),
    });
    await reorderWithFullCatalog(client, ['vis-1', 'vis-2']);
    expect(reorderProducts).toHaveBeenCalledTimes(1);
    const submitted = reorderProducts.mock.calls[0][0] as string[];
    expect(submitted.slice(0, 2)).toEqual(['vis-1', 'vis-2']);
    expect(submitted.slice(2)).toHaveLength(250);
    expect(submitted[2]).toBe('arch-0');
  });
});
