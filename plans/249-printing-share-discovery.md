# Plan 249: Bring `/impresiones/` into the share-preview contract and fix the SearchAction target

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 97b21096..HEAD -- astro-poc/src/pages/impresiones.astro astro-poc/src/components/StructuredData.astro tools/generate-home-og.mjs tools/share-preview-monitor.mjs docs/operations/SHARE_PREVIEW.md package.json astro-poc/scripts/validate-artifact-contract.mjs`
> If any changed, re-read before editing; unexplained divergence is a STOP
> condition.

## Status

- **Priority**: P2 (direction — operator-selected)
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `97b21096`, 2026-10-18

## Why this matters

The printing service is the most actively invested surface of the last
month (5 PRs + fixes in its first week; its own CTA is a `wa.me` share) and
it is spread **by WhatsApp** — yet:

1. `/impresiones/` is not in the supported share-preview families
   (`docs/operations/SHARE_PREVIEW.md:5-9` lists only `/`, `/<category>/`,
   `/p/<sku>/`), the live monitor probes only home + one category + one
   product (`tools/share-preview-monitor.mjs:103-121`), and the page shares
   with the generic business logo (`impresiones.astro:21-28`,
   `ogImage: DEFAULT_OG_IMAGE`) while every other promoted surface has
   dedicated artwork through the pipeline (`tools/generate-home-og.mjs`,
   `generate-category-og.mjs`).
2. The home JSON-LD declares a `SearchAction` to
   `/?search={search_term_string}` (`StructuredData.astro:93`) but search
   lives at `/buscar/?q=` (`index.astro:88-99`); no page reads `?search=`
   — a public claim about a URL that does nothing.

## Current state

- `astro-poc/src/pages/impresiones.astro:21-28` — `createSharePreviewMetadata({ …, ogImage: DEFAULT_OG_IMAGE, … })`.
- `tools/generate-home-og.mjs` — the template pattern for a 1200×1200 OG
  jpg with `?v=` byte-token versioning; `package.json:46` shows the
  `preflight-hash.mjs` gate wrapper pattern (`images:og:home`).
- `tools/share-preview-monitor.mjs:103-121` — target list (home, one
  category, one product); `test/share-preview-monitor.test.js` exists.
- `docs/operations/SHARE_PREVIEW.md` — supported families + source-of-truth
  list + the "required validation" section.
- `astro-poc/scripts/validate-artifact-contract.mjs` — build enforcement for
  share-preview metadata (read before adding a family).

## Commands you will need

| Purpose        | Command                                                                                                        | Provenance | Expected on success |
| -------------- | -------------------------------------------------------------------------------------------------------------- | ---------- | ------------------- |
| Install        | `npm ci`                                                                                                       | declared   | exit 0              |
| OG generation  | `npm run images:og:printing` (new script)                                                                      | declared   | exit 0              |
| Build          | `npm run build`                                                                                                | declared   | exit 0              |
| Focused tests  | `npx vitest run test/seo.spec.js test/share-preview.build-contract.test.js test/share-preview-monitor.test.js` | declared   | all pass            |
| Monitor (live) | `npm run monitor:share-preview` (network; post-deploy optional)                                                | declared   | pass                |

## Scope

**In scope**:

- `tools/generate-printing-og.mjs` (create) + `package.json` script
  `images:og:printing` (gate-wrapped like `images:og:home`) + preflight
  wiring in the root `preflight` script (`package.json:30`)
- `assets/images/og/printing.og.jpg` (generated, committed)
- `astro-poc/src/pages/impresiones.astro` (ogImage + alt)
- `tools/share-preview-monitor.mjs` (target list) +
  `test/share-preview-monitor.test.js`
- `docs/operations/SHARE_PREVIEW.md`
- `astro-poc/src/components/StructuredData.astro` (SearchAction)
- `test/seo.spec.js` (SearchAction assertion)

**Out of scope**:

- Generalizing the monitor into a crawler (keep it a handful of probes).
- The printing page UI/pricing.

## Git workflow

- Branch: `advisor/249-printing-share`
- Commits: `feat(seo): … (plan 249)`.

## Steps

### Step 1: Printing OG artwork

Copy `tools/generate-home-og.mjs` → `tools/generate-printing-og.mjs`;
change the copy (title/eyebrow/price hints) and output path to
`assets/images/og/printing.og.jpg`. Add the `images:og:printing` script
with the same `preflight-hash.mjs` inputs/outputs pattern as
`images:og:home` (`package.json:46`) and insert it into the root preflight
chain next to the other OG steps. Generate and commit the asset.

**Verify**: `npm run images:og:printing` → exit 0; second run is
hash-gated ("skipping"); the image exists and is 1200×1200 jpg.

### Step 2: Wire the page

`impresiones.astro`: `ogImage` → the new asset path with the `?v=` token
mechanism used by the other surfaces (copy exactly how `index.astro` does
it — do not invent); update `ogImageAlt`.

**Verify**: `npm run build` → exit 0; `grep -o 'og:image" content="[^"]*"' astro-poc/dist/impresiones/index.html` → the printing OG URL.

### Step 3: Monitor + contract docs

- `share-preview-monitor.mjs` targets: add `{ path: '/impresiones/', … }`
  with the same shape as existing entries.
- `test/share-preview-monitor.test.js`: extend the target-list assertion.
- `SHARE_PREVIEW.md`: add `/impresiones/` to supported families and the
  generator to the source-of-truth list.

**Verify**: `npx vitest run test/share-preview-monitor.test.js` → pass.

### Step 4: SearchAction fix

`StructuredData.astro:93`: `urlTemplate` → `${SITE_URL}/buscar/?q={search_term_string}`.
Add an assertion to `test/seo.spec.js` that the rendered JSON-LD contains
`/buscar/?q={search_term_string}` and NOT `/?search=`.

**Verify**: `npx vitest run test/seo.spec.js` → pass; rebuild, grep the
home HTML.

### Step 5: Full gates

**Verify**: `npm run build` → exit 0; `npm test` → all pass;
`npm run validate` stages relevant; optionally `npm run monitor:share-preview`
against the live site after merge (post-deploy).

## Test plan

- New/extended: monitor target list, SearchAction, build-metadata for the
  printing OG (model `home-og.build-metadata.test.js` — add the printing
  file to its coverage or a sibling).
- Note: `test/ssr-product-links.build-contract.test.js` (plan 236) and the
  five build-contract files run in CI once plan 233 lands — keep this new
  metadata test compatible with that job (add its file to the list if the
  job exists, same rule as plan 236).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -n "printing.og.jpg" astro-poc/src/pages/impresiones.astro` matches
- [ ] `grep -n "/buscar/?q=" astro-poc/src/components/StructuredData.astro` matches; `grep -n "?search=" astro-poc/src/components/StructuredData.astro` returns nothing
- [ ] `npm run images:og:printing` gated-idempotent
- [ ] `npm test` exits 0
- [ ] SHARE_PREVIEW.md lists `/impresiones/`
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `validate-artifact-contract.mjs` rejects the new family (report the
  check; it likely needs the same rule extended — coordinate, do not
  weaken the check).
- The `?v=` byte-token mechanism is generated centrally (not per page) —
  follow the central path instead of copying.
- Building the OG requires assets not present in the repo (report).

## Maintenance notes

- Artwork maintenance follows the `?v=` pipeline (cache-busting handled).
- The monitor gains one live probe per release gate — keep it at one
  printing probe.
- **Deferred:** OG for `/buscar/` (search page sharing is not a promoted
  surface today).
