// Plan 195: canonical discount math for the admin runtime — one named formula
// instead of inline copies drifting per surface.
//
// Precision contract (owner-confirmed, plan 195/D4): the admin list shows
// TWO decimals. The storefront shows INTEGERS (astro
// product-card-helpers discountPercentInt) and the catalog filters compare
// the RAW ratio (productRepository) — those are different surfaces with
// different needs, deliberately not unified. What IS unified here: every
// 2-decimal site computes it identically. tools computeDiscountMeta keeps
// its own integer copy (separate runtime) under the same contract comment.
export function discountPercent2(price: number, discount: number): number {
  return price > 0 ? Math.round((discount / price) * 10000) / 100 : 0;
}
