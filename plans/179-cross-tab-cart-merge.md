# Plan 179: Converge cross-tab cart edits instead of last-writer-wins

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 0847089c..HEAD -- astro-poc/src/scripts/storefront.js astro-poc/src/scripts/storefront/storefront-state.ts astro-poc/src/scripts/storefront/storage-contract.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/170-land-working-tree-baseline.md
- **Category**: bug
- **Planned at**: commit `0847089c`, 2026-09-14

## Why this matters

`loadCart`/`saveCart` are read-modify-write on `localStorage` with no
`storage`/`BroadcastChannel` listener anywhere in `astro-poc/src` — two open
tabs silently drop one tab's additions (second saver overwrites the first).
Grocery shoppers commonly keep a shop tab plus a shared-cart link tab open,
so this loses real items with no error. The fix is a merge-on-`storage`-event
plus resync, but merge semantics (max vs sum quantities) need the product
decision recorded here — default to max (idempotent, never double-counts).

## Current state

Relevant files:

- `astro-poc/src/scripts/storefront.js` — `loadCart`/`saveCart` (lines
  146–184, incl. legacy `cart` key write-through), `setQty`/`getQty` (lines
  ~1200–1268), `syncAllActionAreas` (lines 505–512), badge/cart render calls.
- `astro-poc/src/scripts/storefront/storefront-state.ts` —
  `sanitizeCart`/`getCartState` (pure, well-tested — 90.91% mutation score).
- `astro-poc/src/scripts/storefront/storage-contract.ts` — `loadJson`/
  `saveJson` slot access, `astro-poc-*` keys + legacy `cart` alias.

Excerpts (verified by advisor read):

```js
// storefront.js:146-184 — read-modify-write, no cross-tab listener
function loadCart() {
  const cart = sanitizeCart(storefrontStorage.loadJson('cart', []));
  // ... legacy migration + write-through ...
}
function saveCart(cart) {
  const sanitized = sanitizeCart(cart);
  const saved = storefrontStorage.saveJson('cart', sanitized);
  ...
}
```

```js
// storefront.js setQty path — mutates module-level `cart`, saves, re-renders
const setQty = (id, nextQty, fallbackProduct = null) => { ... cart.push/splice ... saveCart(cart); updateBadge(...); renderCart(...); syncAllActionAreas(cart); ... }
```

Conventions: cart items `{ id, quantity }` clamped via `clampQty`;
`sanitizeCart` is the trust boundary (all loads go through it); storage keys
in `storage-contract.ts` (`astro-poc-*` + legacy `cart` read-only upgrade
alias). Tests: `test/cart-view.spec.js`, `test/storefront-totals.spec.js`
(landed by plan 170), `test/storefront.storage-contract.spec.js` (has a
`waitForTimeout(200)` — plan 193 owns that flake; do not touch it here).

## Commands you will need

| Purpose | Command                                                                                                         | Provenance | Expected on success |
| ------- | --------------------------------------------------------------------------------------------------------------- | ---------- | ------------------- |
| Install | `npm ci`                                                                                                        | declared   | exit 0              |
| Tests   | `npx vitest run test/cart-view.spec.js test/storefront-totals.spec.js test/storefront.storage-contract.spec.js` | declared   | all pass            |

## Scope

**In scope**:

- `astro-poc/src/scripts/storefront.js` (storage listener + merge + resync)
- `test/storefront-cross-tab.spec.js` (create)

**Out of scope**:

- Changing `sanitizeCart`, key names, or the legacy write-through (untouched).
- `BroadcastChannel` (use `storage` events — simpler, sufficient; document
  why in the commit).
- Sum-vs-max debate beyond implementing max + documenting the decision.
- The `waitForTimeout` flake in storage-contract.spec (plan 193).

## Git workflow

- Branch: `advisor/179-cross-tab-cart-merge`
- Commit per step; e.g. `fix(storefront): merge cross-tab cart edits on storage events (plan 179)`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 0: Establish a green baseline

Requires plan 170 DONE. Run the three cart/storage spec files unmodified.

**Verify**: green; otherwise STOP.

### Step 1: Merge on `storage` events and resync UI

- Add a `window.addEventListener('storage', ...)` handler: when
  `event.key` is the canonical cart key (resolve via the same helper
  `saveCart` uses — do not hardcode a second copy of the key), parse
  `event.newValue` (guard JSON errors → ignore frame), `sanitizeCart` it,
  and merge with the in-memory `cart` by id with **max-quantity wins**
  (union of ids; per id `Math.max(local, remote)` after clamping).
- After merge, if anything changed: `saveCart` (only if the merged result
  differs from `event.newValue`, to avoid echo loops — `storage` events do
  not fire in the originating tab, but guard anyway), then re-run the same
  resync sequence `setQty` uses (`updateBadge`, `renderCart`,
  `syncAllActionAreas` or their scoped equivalents).
- Ignore events with `event.key === null` (storage.clear) except for a
  safe re-render from the merged/empty state — document the choice.

**Verify**: targeted spec files pass.

### Step 2: Add cross-tab tests

Create `test/storefront-cross-tab.spec.js` (jsdom; dispatch
`new StorageEvent('storage', { key, newValue })` or call the handler):

1. Tab B adds item X remotely → tab A merges without losing local item Y.
2. Same item both tabs → max quantity wins (no doubling).
3. Malformed `newValue` → ignored, local cart intact.
4. Remote removal (item absent, key present) → local keeps its copy only if
   locally touched? Define: absent-in-remote + present-locally = keep local
   (deletion does not propagate — document this limitation in the test
   name so a future plan can implement tombstones).

**Verify**: full root vitest suite green (`npx vitest run test/`).

## Test plan

- New `test/storefront-cross-tab.spec.js`, 4 cases above.
- Existing cart/total/storage specs unchanged and green.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npx vitest run test/` exits 0 with the 4 new cross-tab tests passing.
- [ ] `grep -n "addEventListener('storage'" astro-poc/src/scripts/storefront.js` matches.
- [ ] No new storage keys; legacy write-through untouched.
- [ ] `git diff --name-only 0847089c...HEAD` lists only in-scope files.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report back (do not improvise) if:

- The cart key cannot be resolved through the existing helper (do not
  hardcode a duplicate key — report).
- `setQty`'s resync sequence cannot be reused for the merge path without
  restructuring (report the shape; do not restructure cart rendering here).
- The owner wants sum-instead-of-max (STOP and ask — it changes test 2).
- Any `declared` command fails on the unmodified checkout.

## Maintenance notes

- Deletion does not propagate (test 4 documents it) — a tombstone protocol
  is the follow-up if operators report ghost items; file separately with
  evidence, not speculatively.
- Reviewer: check for echo loops (save inside the handler must not
  re-trigger the handler in the same tab — `storage` events don't, but the
  guard must be obviously present).
- **Deferred:** deletion propagation via tombstones (only on operator evidence).
