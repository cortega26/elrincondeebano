// Plan 221: one product-filter contract shared by GET /products, the CSV
// export, and bulk scope:'all'. Both transports parse onto ProductFilters,
// which productRepository.getAll consumes — the repository predicate is the
// single filter implementation. These parsers only coerce transport shapes
// (query strings vs JSON bodies); they never filter.
//
// Coerce rules are copies of the previous per-route parses:
//   - query shape (GET /products, /export.csv): strings only; '' → not set;
//     invalid numeric strings become NaN (the GET route keeps its existing
//     non-finite → empty-result check after parsing);
//   - body shape (bulk scope:'all'): booleans/numbers arrive typed;
//     non-finite numbers → undefined (no filter).

export interface ProductFilters {
  q?: string;
  category?: string;
  archived?: boolean;
  out_of_stock?: boolean;
  min_price?: number;
  max_price?: number;
  discounted_only?: boolean;
  min_discount?: number;
  max_discount?: number;
}

// Query-string shape (GET /products, /export.csv): all values are strings.
export function parseQueryFilters(query: Record<string, string | undefined>): ProductFilters {
  const minPrice =
    query.min_price !== undefined && query.min_price !== ''
      ? Math.max(0, Number(query.min_price))
      : undefined;
  const maxPrice =
    query.max_price !== undefined && query.max_price !== ''
      ? Math.max(0, Number(query.max_price))
      : undefined;
  return {
    q: query.q?.trim() || undefined,
    category: query.category?.trim() || undefined,
    archived: query.archived !== undefined ? query.archived === 'true' : undefined,
    out_of_stock: query.out_of_stock !== undefined ? query.out_of_stock === 'true' : undefined,
    min_price: minPrice,
    max_price: maxPrice,
    discounted_only: query.discounted_only === 'true' ? true : undefined,
    min_discount:
      query.min_discount !== undefined && query.min_discount !== ''
        ? Math.min(100, Math.max(0, Number(query.min_discount)))
        : undefined,
    max_discount:
      query.max_discount !== undefined && query.max_discount !== ''
        ? Math.min(100, Math.max(0, Number(query.max_discount)))
        : undefined,
  };
}

// JSON-body shape (bulk scope:'all'): booleans/numbers arrive typed.
export function parseBodyFilters(raw: unknown): ProductFilters {
  const f = (raw ?? {}) as Record<string, unknown>;
  const minPrice = f.min_price !== undefined ? Number(f.min_price) : undefined;
  const maxPrice = f.max_price !== undefined ? Number(f.max_price) : undefined;
  const minDiscount = f.min_discount !== undefined ? Number(f.min_discount) : undefined;
  const maxDiscount = f.max_discount !== undefined ? Number(f.max_discount) : undefined;
  return {
    q: typeof f.q === 'string' && f.q.trim() ? f.q.trim() : undefined,
    category: typeof f.category === 'string' && f.category.trim() ? f.category.trim() : undefined,
    archived: f.archived !== undefined ? f.archived === true : undefined,
    out_of_stock: f.out_of_stock !== undefined ? f.out_of_stock === true : undefined,
    min_price:
      minPrice !== undefined && Number.isFinite(minPrice) ? Math.max(0, minPrice) : undefined,
    max_price:
      maxPrice !== undefined && Number.isFinite(maxPrice) ? Math.max(0, maxPrice) : undefined,
    discounted_only: f.discounted_only !== undefined ? f.discounted_only === true : undefined,
    min_discount:
      minDiscount !== undefined && Number.isFinite(minDiscount)
        ? Math.min(100, Math.max(0, minDiscount))
        : undefined,
    max_discount:
      maxDiscount !== undefined && Number.isFinite(maxDiscount)
        ? Math.min(100, Math.max(0, maxDiscount))
        : undefined,
  };
}
