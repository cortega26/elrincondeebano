# Plan 236: Pin the SSR product links with a build-contract test

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat f7654a51..HEAD -- astro-poc/src/components/ProductCard.astro astro-poc/src/components/ProductCardStrip.astro test/ssr-product-links.build-contract.test.js .github/workflows/ci.yml`
> (Reconciled to `f7654a51`: plan 233 has LANDED — `ci.yml` now contains the
> `build-contract-tests` job, so Step 2's conditional is active: append the
> new test file to that job's list. The component excerpts are unchanged.)
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: 233 (the CI job that runs build-contract suites) — if 233
  has landed, extend its command; if not, write the test and note it
- **Category**: tests
- **Planned at**: commit `97b21096`, 2026-10-18 (reconciled to `f7654a51`: plan 233 landed; ci.yml gained the `build-contract-tests` job — Step 2 is now unconditionally active)

## Why this matters

The SEO fix `953f74c5` (~91 orphan product URLs) added server-rendered
`/p/<sku>/` anchors to the product cards, so crawlers that don't run JS can
discover product pages. **Nothing tests the anchors** (`grep -rn
"product-card__copy|productPath" test/ tools/` → zero matches): a future
card-markup refactor can silently re-orphan every product page while all
SEO guardrails stay green (they pin canonical/robots/OG — not
discoverability).

## Current state

`astro-poc/src/components/ProductCard.astro:32,50,79`:

```js
const productPath = `/p/${sku}/`;
...
<a class="product-card__media" href={productPath} tabindex="-1" aria-hidden="true">
...
<a class="product-card__copy" href={productPath}>
```

`ProductCardStrip.astro:45,74` — same anchors. The built HTML is the only
artifact that matters (crawlers read it without JS).

Patterns to follow (build-artifact contract tests):
`test/product-og.build-metadata.test.js` (dist-missing → skip only when
`CI_SKIP_BUILD_CONTRACT === '1'`, else fail), helpers in
`test/helpers/repo-files.js` (`readDistFile`, `distRoot`) and
`test/helpers/product-catalog.js`.

## Commands you will need

| Purpose    | Command                                                        | Provenance | Expected on success |
| ---------- | -------------------------------------------------------------- | ---------- | ------------------- |
| Install    | `npm ci`                                                       | declared   | exit 0              |
| Build      | `npm run build` (or reuse fresh dist)                          | declared   | exit 0              |
| New test   | `npx vitest run test/ssr-product-links.build-contract.test.js` | declared   | all pass            |
| Full tests | `npm test`                                                     | declared   | all pass            |

## Scope

**In scope**:

- `test/ssr-product-links.build-contract.test.js` (create)
- `.github/workflows/ci.yml` — ONLY if a `build-contract-tests` job exists
  (plan 233): add the new file to its `npx vitest run` list

**Out of scope**:

- The components themselves (anchor markup is correct today — this plan
  pins it).
- Any other build-contract wiring.

## Git workflow

- Branch: `advisor/236-ssr-anchor-test`
- Commit: `test(seo): pin SSR product links in built HTML (plan 236)`.

## Steps

### Step 0: Establish a green baseline

`npm ci` + ensure `astro-poc/dist` exists (build if not) + run an existing
build-contract file (`npx vitest run test/home-og.build-metadata.test.js`)
to confirm the pattern works. Red → STOP.

### Step 1: Write the test

`test/ssr-product-links.build-contract.test.js`:

1. Follow the dist guard of the sibling tests (skip only with
   `CI_SKIP_BUILD_CONTRACT === '1'` and no dist; otherwise fail).
2. Pick a category page known to exist (`/bebidas/` has been stable; read
   `data/categories.json` if a helper exists — see
   `test/helpers/product-catalog.js`).
3. Read `dist/bebidas/index.html` (via `readDistFile`) and assert:
   - at least 3 occurrences of `href="/p/` (guard against a fully
     anchor-less card refactor),
   - for at least one sampled product from `data/product_data.json` in that
     category, the exact `href="/p/<sku>/"` string appears (compute the SKU
     with `getProductSku` from `astro-poc/src/lib/product-identity.ts`, the
     same import the sibling tests use — verify the export exists first),
   - the anchor markup is server-rendered: the assertion reads raw HTML,
     with no JS execution (that is implicit).
4. Keep the messages actionable: on failure, say "product cards lost their
   SSR anchors — the orphan-page SEO fix is regressing".

**Verify**: `npx vitest run test/ssr-product-links.build-contract.test.js`
against a fresh build → pass; temporarily empty a scratch copy of dist to
confirm the failure branch (do not commit).

### Step 2: Wire into CI (conditional)

If `.github/workflows/ci.yml` contains a `build-contract-tests` job
(plan 233), append the new file to its file list. If not, do nothing here
and state in the completion note: "plan 233 must include
`test/ssr-product-links.build-contract.test.js` in its command list".

**Verify**: `grep -n "ssr-product-links" .github/workflows/ci.yml` (may be
absent if 233 has not landed — that is the documented case).

### Step 3: Full gates

**Verify**: `npm test` → all pass; `npm run lint` → exit 0.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npx vitest run test/ssr-product-links.build-contract.test.js` exits 0 with dist present
- [ ] `grep -c "href=" test/ssr-product-links.build-contract.test.js` ≥ 1 (the assertion exists)
- [ ] `npm test` exits 0
- [ ] (if 233 landed) the CI job command includes the new file
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The sampled category page does not contain `href="/p/` anchors at all
  (that would mean the fix regressed already — report `file:line` from the
  built HTML).
- `getProductSku` is not exported/importable the way the sibling tests use
  it (report; compute the SKU from the product id field instead, and say
  which you used).
- A `declared` command fails on the unmodified checkout (Step 0).

## Maintenance notes

- If cards move to a component library or the category list changes,
  update the fixture category/sample; the assertion stays "raw HTML has
  anchors".
- Reviewer: confirm the test fails when the anchors are removed (verified
  in Step 1's scratch check).
- **Deferred:** a crawler-happy-path e2e against the live site is monitor
  territory (post-deploy), not this suite.
