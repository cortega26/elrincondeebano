import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ContentManagerClient } from '../../api/client.ts';
import type { PaginatedResponse, ProductFilters, ProductResponse } from '../../api/client.ts';

const client = new ContentManagerClient();

export const PAGE_LIMIT = 50;

// Plan 094: URL-driven product query hook — owns filters, pagination,
// debounced loading with a monotonic race guard, and the data/loading/error
// state. Extracted from ProductsPage so the page only orchestrates UI.
export function useProductsQuery(): {
  data: PaginatedResponse<ProductResponse> | null;
  loading: boolean;
  loadError: string | null;
  reload: () => void;
  q: string;
  category: string;
  archived: string;
  outOfStock: string;
  minPrice: string;
  maxPrice: string;
  discountedOnly: string;
  minDiscount: string;
  maxDiscount: string;
  page: number;
  filters: ProductFilters;
  activeFilterCount: number;
  setFilterParam: (key: string, value: string) => void;
  clearFilters: () => void;
} {
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState<PaginatedResponse<ProductResponse> | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const requestSeq = useRef(0);

  const q = searchParams.get('q') ?? '';
  const category = searchParams.get('category') ?? '';
  // Fix (verificación 2026-08-13): the default list shows ACTIVE products
  // only — archived items stay visible under the 'Archivados' filter. The
  // previous default ('') included archived products in the operator's main
  // list, so archiving read as "delete didn't work".
  const archived = searchParams.get('archived') ?? 'false';
  const outOfStock = searchParams.get('out_of_stock') ?? '';
  const minPrice = searchParams.get('min_price') ?? '';
  const maxPrice = searchParams.get('max_price') ?? '';
  const discountedOnly = searchParams.get('discounted_only') ?? '';
  const minDiscount = searchParams.get('min_discount') ?? '';
  const maxDiscount = searchParams.get('max_discount') ?? '';
  const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1);

  const filters: ProductFilters = {
    q: q || undefined,
    category: category || undefined,
    archived: archived === 'true' ? true : archived === 'false' ? false : undefined,
    out_of_stock: outOfStock === 'true' ? true : undefined,
    min_price: minPrice ? Number(minPrice) : undefined,
    max_price: maxPrice ? Number(maxPrice) : undefined,
    discounted_only: discountedOnly === 'true' ? true : undefined,
    min_discount: minDiscount ? Number(minDiscount) : undefined,
    max_discount: maxDiscount ? Number(maxDiscount) : undefined,
  };

  const activeFilterCount = [
    q,
    category,
    archived,
    outOfStock,
    minPrice,
    maxPrice,
    discountedOnly,
    minDiscount,
    maxDiscount,
  ].filter((v) => v !== '').length;

  const load = useCallback(async (): Promise<void> => {
    // Plan 088: monotonic request id — a slow older response must never
    // overwrite a newer filter/page result.
    const seq = ++requestSeq.current;
    setLoading(true);
    setLoadError(null);
    try {
      const result = await client.getProducts({ ...filters, page, limit: PAGE_LIMIT });
      if (seq !== requestSeq.current) return;
      setData(result);
    } catch (err) {
      if (seq !== requestSeq.current) return;
      setLoadError((err as Error).message);
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [
    q,
    category,
    archived,
    outOfStock,
    minPrice,
    maxPrice,
    discountedOnly,
    minDiscount,
    maxDiscount,
    page,
  ]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 250);
    return () => clearTimeout(timer);
  }, [load]);

  function setFilterParam(key: string, value: string): void {
    const next = new URLSearchParams(searchParams);
    if (value) {
      next.set(key, value);
    } else {
      next.delete(key);
    }
    if (key !== 'page') next.delete('page');
    setSearchParams(next);
  }

  function clearFilters(): void {
    const next = new URLSearchParams(searchParams);
    for (const key of [
      'q',
      'category',
      'archived',
      'out_of_stock',
      'min_price',
      'max_price',
      'discounted_only',
      'min_discount',
      'max_discount',
    ]) {
      next.delete(key);
    }
    next.delete('page');
    setSearchParams(next);
  }

  return {
    data,
    loading,
    loadError,
    reload: () => load(),
    q,
    category,
    archived,
    outOfStock,
    minPrice,
    maxPrice,
    discountedOnly,
    minDiscount,
    maxDiscount,
    page,
    filters,
    activeFilterCount,
    setFilterParam,
    clearFilters,
  };
}
