# Plan 219: One cart trust contract — max-wins duplicates everywhere, and rehydrate stale lines from the live catalog

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 32d90295..HEAD -- astro-poc/src/scripts/storefront.js astro-poc/src/scripts/storefront/storefront-state.ts test/storefront-state.spec.js test/storefront-totals.spec.js test/e2e-astro/storage-contract.spec.ts`
> (Reconciled after plan 218: only `storefront.js` gained the SW import +
> registration guard, so the line references below shifted +1 before
> ~line 1107 and +12 after it; content unchanged.)
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `97b21096`, 2026-10-18 (reconciled to `32d90295` after plan 218 — line shifts only)

## Why this matters

Two user-visible money-path defects in the cart:

1. **Stale pricing**: a cart persisted before a catalog price edit keeps the
   old `price`/`discount` in localStorage. `order-submit.js` builds the
   WhatsApp message and the total from those stored fields, so the customer
   orders at a price that no longer exists and the operator corrects orders
   by hand. The persisted snapshot is authoritative for **identity** (don't
   resurrect deleted items — the Oct-18 fixes) but not for **display and
   pricing** — the shared-link path already rehydrates pricing from the
   current catalog; the persisted path does not.
2. **Three duplicate-row semantics**: the persisted cart collapses duplicate
   rows by `max` ("a stale historical row must never inflate an order"), the
   shared-link encoder **sums** duplicates ("historical additive contract"),
   and the shared-link parser keeps the **first** entry. A sender with a
   legacy duplicate cart shares a link whose quantity differs from what they
   see, and a legacy additive link is applied as first-wins.

This plan makes `max`-wins the single contract and refreshes each cart line
from the live catalog on load and before checkout — **in memory only**:
storage keeps its existing persistence rules (`visualCartIdentity` includes
price/discount, so writing refreshed fields back could collapse rows whose
quantities were distinct). The identity rules (`sameCartProduct`, "deleted
products never reappear") are preserved.

## Current state

`astro-poc/src/scripts/storefront/storefront-state.ts:111-114` — persisted
sanitizer (the contract to adopt):

```ts
// Max, not sum: a stale historical row must never inflate an order.
if (item.quantity > normalized[index].quantity) {
  normalized[index] = item;
}
```

`storefront-state.ts:197-225` — encoder sums:

```ts
const merged = new Map<string, number>();
// Shared links preserve their historical additive duplicate contract.
// Persisted carts use sanitizeCart's stricter one-line-per-SKU invariant.
...
const quantity = clampQty((merged.get(id) ?? 0) + clampQty(item.quantity));
```

`storefront-state.ts:247-258` — parser keeps the first duplicate:
`if (!id || quantity <= 0 || seen.has(id)) { continue; }`

`astro-poc/src/scripts/storefront.js:158-169` — `loadCart` only sanitizes:

```js
function loadCart() {
  const raw = storefrontStorage.loadJson('cart', []);
  const cart = sanitizeCart(raw);
  if (Array.isArray(raw) && raw.length !== cart.length) {
    saveCart(cart);
  }
  return cart;
}
```

`storefront.js:253-255` — the resolver composition used by the shared-link
path (reuse it):

```js
var hydrated = hydrateSharedCart(raw, function (id) {
  return getProductByIdFromSource(id) || getProductFromCard(getProductCardById(id));
});
```

`storefront.js:1275-1286` — `setQty` already refreshes touched lines when it
has a `fallbackProduct`; untouched lines never refresh.

`astro-poc/src/scripts/storefront/order-submit.js:33-46` — the WhatsApp
message and total come from stored `item.price`/`item.discount`.

Repo conventions: cart logic tests live in `test/storefront-state.spec.js`
(pure functions) and `test/storefront-totals.spec.js` (round-trips);
e2e cart flows in `test/e2e-astro/storage-contract.spec.ts` (see the
historical-ID test at lines 527-567 for the seed-then-reload pattern).
`storefront.js` remains the composition root (plan 116 pattern).

## Commands you will need

| Purpose       | Command                                                                                                 | Provenance | Expected on success |
| ------------- | ------------------------------------------------------------------------------------------------------- | ---------- | ------------------- |
| Install       | `npm ci`                                                                                                | declared   | exit 0              |
| Focused tests | `npx vitest run test/storefront-state.spec.js test/storefront-totals.spec.js test/order-submit.spec.js` | declared   | all pass            |
| Full tests    | `npm test`                                                                                              | declared   | all pass            |
| Lint          | `npm run lint`                                                                                          | declared   | exit 0              |
| E2E           | `npm run test:e2e -- storage-contract.spec.ts cart-ux.spec.ts`                                          | declared   | passes              |

## Scope

**In scope**:

- `astro-poc/src/scripts/storefront/storefront-state.ts`
- `astro-poc/src/scripts/storefront.js` (loadCart + submit path only)
- `test/storefront-state.spec.js`, `test/storefront-totals.spec.js`
- `test/e2e-astro/storage-contract.spec.ts` (add one test; do not weaken existing ones)

**Out of scope** (do NOT touch):

- Identity/dedup rules (`visualCartIdentity`, `sameCartProduct`, the
  historical-ID upgrade on add) — working as designed (Oct-18 fixes).
- Cross-tab merge semantics (plan 179) and the storage contract module.
- The shared-cart refusal toast flow (plan 117).
- Any change that drops lines whose product no longer exists — the persisted
  snapshot stays authoritative for identity; this plan only refreshes
  fields when a live product is found.

## Git workflow

- Branch: `advisor/219-cart-trust-contract`
- Commit per step; conventional commits, e.g.
  `fix(cart): unify duplicate semantics and rehydrate pricing (plan 219)`.

## Steps

### Step 0: Establish a green baseline

Run Install, then the focused tests and `npm test` on the unmodified
checkout. If a `declared` command fails, STOP and report.

**Verify**: focused tests → all pass.

### Step 1: Unify duplicate semantics to max (encoder + parser)

In `storefront-state.ts`:

- `toSharedCartPayload`: replace the sum with max —
  `const quantity = Math.max(merged.get(id) ?? 0, clampQty(item.quantity));`
  and replace the "historical additive" comment with the new contract
  ("duplicate rows collapse by max, matching sanitizeCart; a stale row must
  never inflate an order on either side of a shared link").
- `parseSharedCartPayload`: instead of skipping seen ids, merge them —
  track a `Map<string, number>` and keep the max. Update the comment.

Then update the tests that encode the old behavior
(`test/storefront-totals.spec.js` around lines 88-103 and any additive
duplicate case): the round-trip must preserve max semantics in both
directions. Expected: previously passing additive assertions fail before the
test update — that is the point of this step.

**Verify**: `npx vitest run test/storefront-totals.spec.js test/storefront-state.spec.js` → all pass after test updates.

### Step 2: Add a pure rehydration helper

In `storefront-state.ts` add:

```ts
export interface CartRefreshResult {
  cart: CartItem[];
  changed: boolean;
}

// Refresh display/pricing fields of persisted lines from the live catalog.
// Identity is NOT changed: lines whose product cannot be resolved are kept
// untouched (snapshot is authoritative for identity — deleted products must
// not reappear or silently vanish from the cart).
export function refreshCartItemsFromCatalog(
  cart: CartItem[],
  resolveProductById: (id: string) => unknown
): CartRefreshResult;
```

Semantics: for each item, resolve `resolveProductById(item.id)`; if a product
record is found, rebuild with `createCartItemFromProduct(product, item.quantity)`
(keeps id, name, category, price, discount, image from the live product;
`createCartItemFromProduct` already exists in the module) and mark `changed`
when any field differs. If not found, keep the item as-is. Never change
`quantity`, never drop or add lines, never reorder.

Unit tests (in `test/storefront-state.spec.js`): price changed → refreshed;
discount changed → refreshed; name/image changed → refreshed; unknown id →
untouched; quantity preserved; `changed` false when nothing differs.

**Verify**: `npx vitest run test/storefront-state.spec.js` → all pass.

### Step 3: Apply rehydration **in memory only** at load and before checkout

**Design constraint (do not violate):** the refresh is a read-time
projection — it must NOT write localStorage. `visualCartIdentity()`
(`storefront-state.ts:53-77`) includes `price`/`discount`/image in the
fingerprint the next `sanitizeCart` uses to collapse duplicate rows; writing
refreshed fields back would let two rows that were previously distinct be
merged by `max` on the next load — a silent quantity-loss class. Persistence
stays owned by the existing mutation flows (`setQty`, add/remove; the
persist-first contract from the Oct-18 fixes).

In `storefront.js`:

1. Extract the resolver arrow already used at line 253 into a named
   function `resolveLiveProductForCart(id)` and reuse it in both places
   (line 253 and the new refresh sites).
2. In `loadCart()` (lines 158-169): after `sanitizeCart(raw)` and the
   existing duplicate-repair write, return
   `refreshCartItemsFromCatalog(cart, resolveLiveProductForCart).cart`.
   Do **not** call `saveCart` because of refresh changes.
3. Before the checkout message is built: at the composition root, the submit
   entry is `submitCartOrder = orderSubmitController.submitCartOrder;`
   (currently `storefront.js:1188`; the `#submit-cart` handler around
   `:1552-1574` invokes it). Wrap that entry so the in-memory `cart` is
   refreshed with the same helper first and the refreshed cart is what the
   controller receives — read `order-submit.js` for the exact
   `submitCartOrder` signature/argument handling before choosing the wrapper.
   Re-render (badge + cart view) when the refresh changed anything, so the
   confirmation dialog and the WhatsApp text share one pricing. No storage
   write here either.

If at load time the catalog is not yet available (`getProductByIdFromSource`
returns undefined and the DOM has no cards), the helper keeps items
untouched — that is acceptable; the checkout-time refresh in (3) is the
guarantee that matters. Do not add retries, timers, or storage TTLs.

**Verify**: `npx vitest run test/order-submit.spec.js test/storefront-state.spec.js test/storefront-totals.spec.js` → all pass.

### Step 4: E2E for stale-price refresh

Add one test to `test/e2e-astro/storage-contract.spec.ts` (model after the
historical-ID test at lines 527-567):

1. Read a product card's dataset (id/name/category/price/discount/image).
2. Seed localStorage `astro-poc-cart` with the same item but a **stale
   price** (`price: <current price + 500>`), quantity 2.
3. Reload; open the cart; assert `#cart-total` (and the rendered line
   price) reflect the **current** catalog price.
4. Assert quantity is preserved (`2`) and that the storage snapshot was
   **not** rewritten by the refresh itself (no price change in
   `localStorage.getItem('astro-poc-cart')`) — display refresh is
   in-memory by design (Step 3).

**Verify**: `npm run test:e2e -- storage-contract.spec.ts` → all pass
(whole spec file).

### Step 5: Full gates

**Verify**: `npm test` → all pass; `npm run lint` → exit 0;
`npm run test:e2e` → green.

## Test plan

- Unit: max-merging in encoder/parser (duplicate ids 2+3 → 3 in payload and
  in parse result), round-trip stability, rehydration matrix (see Step 2).
- Unit: refresh is pure — calling `refreshCartItemsFromCatalog` twice is
  idempotent and never mutates the input array.
- E2E: stale price display refresh + storage untouched (Step 4); existing
  cart e2e must stay green — especially `cart-ux.spec.ts` T11 (forged
  payload decode) and the historical-ID test.
- Pattern files: `test/storefront-state.spec.js`,
  `test/e2e-astro/storage-contract.spec.ts`.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npx vitest run test/storefront-state.spec.js test/storefront-totals.spec.js test/order-submit.spec.js` exits 0
- [ ] `npm test` exits 0
- [ ] `npm run lint` exits 0
- [ ] `grep -n "merged.get(id) ?? 0) +" astro-poc/src/scripts/storefront/storefront-state.ts` returns nothing (sum removed)
- [ ] `grep -n "refreshCartItemsFromCatalog" astro-poc/src/scripts/storefront.js astro-poc/src/scripts/storefront/storefront-state.ts` shows definition + both call sites
- [ ] `grep -n "saveCart" astro-poc/src/scripts/storefront.js` shows no new `saveCart` call introduced by the refresh path (diff review)
- [ ] `npm run test:e2e` passes
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The code at the locations in "Current state" doesn't match the excerpts.
- An existing e2e test depends on additive shared-link quantities in a way
  that is not a test-local reimplementation (report which test and what it
  asserts — the operator may want to keep legacy additive decoding for old
  links; proposed fallback in that case: max-merge only for
  `SHARED_CART_VERSION` payloads, keep legacy-array links as max too, but
  report before choosing).
- The checkout-time refresh (Step 3.3) cannot be placed without touching
  out-of-scope code (report the structure you found).
- A `declared` command fails on the unmodified checkout (Step 0).

## Maintenance notes

- Any future change to cart persistence must go through
  `sanitizeCart`/`refreshCartItemsFromCatalog`; two writers with different
  duplicate semantics is exactly the defect class this plan closes.
- Reviewer should scrutinize: no quantity mutation during refresh; the
  refreshed cart is written before render (persist-first contract); e2e
  asserts the persisted storage, not just the DOM.
- **Deferred:** upgrading historical ids to live ids on load — only do it
  with a merge pass (sameCartProduct) and dedup write, which the Oct-18
  add-path already owns. Out of scope here to avoid changing identity rules.
