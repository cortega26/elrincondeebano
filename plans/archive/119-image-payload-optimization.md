# 119 — Image payload: LCP-only fetchpriority, missing variant, unreferenced originals

- **Source**: Auditoría 9, PERF-02 + PERF-04 + TDA-06
- **Status**: TODO · **Priority**: P2 · **Effort**: M
- **Stamped against**: `b3805e1`

## Problem

Three image-payload issues verified in the built site:

1. **19 thumbs `fetchpriority="high"` + eager** (`dist/index.html`): the
   homepage marks 19 product thumbnails (150-200 px, w200 variants)
   `loading="eager" fetchpriority="high"` — they compete with the true LCP
   element for bandwidth on mobile. Category pages repeat the pattern for
   the first card.
2. **One product has no variants**: "Darmax • Lomo Ahumado sin hueso"
   renders a 143,684-byte full-size original as a 200px thumb with no
   srcset (no `variants/w200/.../Lomo-Ahumado-*` file exists), while every
   sibling card uses w200..w640 srcsets. Its `.avif` sibling (452,910 B —
   the largest file in the catalog) is referenced by zero pages.
3. **Unreferenced originals shipped**: across `dist`, 366 full-size
   originals are shipped but only 13 unique non-variant references exist in
   HTML; `dist` is 43 MB, ~37 MB of it images.
4. **Orphaned generator** (TDA-06): `tools/generate-image-variants.js`
   (`images:variants`, package.json:42) writes `image_variants`/
   `thumbnail_variants` into `data/product_data.json` — fields absent from
   the canonical data (0 occurrences); no pipeline runs it
   (preflight/CI run `images:generate`/`images:rewrite`/`images:avif`
   instead); the schema still declares the fields optional
   (`astro-poc/src/lib/data-schemas.ts:23-25`).

## Scope

**In**: the image-generation pipeline (`tools/generate-images.mjs` and
friends — decide the variant-gap fix there), the component that emits
`fetchpriority` (`astro-poc/src/components/` — find where
`fetchpriority="high"` is set), asset-contract tooling
(`tools/guardrails/`, `scripts/validate-artifact-contract.mjs`),
`data-schemas.ts`, and the orphaned `tools/generate-image-variants.js`.

**Out**: the storefront runtime JS.

## Steps

1. **fetchpriority**: keep `high`/`eager` only on the LCP image (the hero /
   first above-the-fold image per page — decide per layout: homepage hero,
   category first card only if it is the LCP); everything else `lazy`/
   `auto`. Find the source of the current assignment (grep
   `fetchpriority` in `astro-poc/src/` — likely a component prop or the
   image-generation step) and change it there, not in dist.
2. **Missing variant**: run the variant generator for the catalog and
   confirm the Lomo-Ahumado product gets w200..w640 variants; if the
   pipeline skips it (name/path edge case), fix the generator; re-build and
   verify the card now uses srcset. Also handle its 452 KB .avif: if
   unreferenced after the fix, exclude it from the deploy surface.
3. **Unreferenced originals**: align the artifact/asset contracts to ship
   only referenced images. Check `reports/orphan-assets/` tooling
   (`tools/guardrails/orphan-assets.js`) — it already reports orphans
   (1 orphan currently); extend the deployment step (or the contract) to
   exclude them from `dist`, and update `validate-artifact-contract.mjs`
   expectations (it asserts 14 required files — image exclusions must not
   trip it).
4. **Orphaned generator**: confirm ownership from git history (which tool
   owns `variants/` output — `generate-images.mjs`/`sync-avif-assets.js`
   per the preflight chain); delete `tools/generate-image-variants.js` and
   its `images:variants` script, drop the vestigial schema fields, update
   `docs/repo/STRUCTURE.md` if it lists it.

## Tests

- Re-build + artifact contract + asset guardrails green (the gates
  themselves are the verification).
- E2E: the images-related storefront tests (homepage product render)
  green — visual output must be unchanged.
- `npm run build` twice (determinism) green.
- Evidence: `dist` size delta (target: ≥ 20 MB smaller) + per-page
  `fetchpriority="high"` count ≤ 1 (grep dist HTML).

## Done criteria

- [ ] `grep -c 'fetchpriority="high"' dist/index.html` → ≤ 1.
- [ ] Lomo-Ahumado card uses a w200 srcset (grep dist HTML).
- [ ] No unreferenced full-size originals in `dist` (contract enforces it).
- [ ] `tools/generate-image-variants.js` deleted; schema fields gone.
- [ ] `npm run validate` green.

## Maintenance

The asset/artifact contracts are the invariant for what ships; any future
image-format addition (avif variants, sizes) goes through the same
contracts so `dist` can't silently grow again.

## Rollback

`git revert <sha>`.
