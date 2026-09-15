// Plan 197: one mapper for product-filter → URLSearchParams, shared by
// getProducts and exportCsv (their inline URLSearchParams blocks were the
// same mapping written twice).
//
// Semantics mirror the originals exactly so requests stay byte-identical:
//   - page/limit/q/category are truthy-checked (page=0 and '' are dropped,
//     matching both original `if (params?.page)` / `if (query.q)` guards);
//   - every other key is defined-checked (archived=false, min_price=0 and
//     min_discount=0 are sent, matching the original `!== undefined` guards).
const TRUTHY_KEYS: ReadonlySet<string> = new Set(['page', 'limit', 'q', 'category']);

export function buildFilterSearchParams(
  source: Readonly<Record<string, string | number | boolean | null | undefined>> | undefined
): URLSearchParams {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(source ?? {})) {
    if (value === undefined || value === null || value === '') continue;
    if (TRUTHY_KEYS.has(key) && !value) continue;
    searchParams.set(key, String(value));
  }
  return searchParams;
}
