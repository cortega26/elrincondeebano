# Plan 239: Dead-surface cleanup — legacy `assets/css` + its lockstep guardrail, the unread card-attribute contract, and the fragile accent folds

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 97b21096..HEAD -- assets/css/ tools/guardrails/critical-css.mjs tools/guardrails/run.mjs scripts/check-css-order.mjs package.json tools/guardrails/orphan-assets.allowlist.json astro-poc/src/lib/product-card-helpers.ts astro-poc/src/components/ProductCard.astro astro-poc/src/components/ProductCardStrip.astro astro-poc/src/components/ProductDetail.astro admin/content-manager/src/shared/comms.ts admin/content-manager/src/shared/text.ts docs/architecture/CODEBASE_MAP.md docs/INCIDENTS.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S–M
- **Risk**: MED (deletions — each section has a verification step)
- **Depends on**: 232 (docs batch adjusts the CODEBASE_MAP row first; this plan then removes or re-points it), 231 (the card-attribute test is written there if you choose the spread path)
- **Category**: tech-debt
- **Planned at**: commit `97b21096`, 2026-10-18

## Why this matters

Three verified dead/duplicated surfaces:

**A. Legacy CSS kept alive by a guardrail, served by nobody.**
`tools/guardrails/critical-css.mjs:3-6,8-48` requires
`assets/css/critical.css` and `assets/css/style.css` to stay selector-synced
(`body/.navbar/.product-thumb/#cart-count/…`), but the built HTML contains
**no** `/assets/css/*` references (audit grep over `astro-poc/dist/*.html`),
the only live referrers are the guardrail itself and
`astro-poc/scripts/sync-data.mjs:272` (copies the whole `assets/` tree), and
commit `0b2fcf87` (footer fix) had to edit the duplicated files twice.
Also dead: `assets/css/style-enhanced.css` (912 lines, zero refs),
`404.css`, `responsive-btn.css`, `app.css`; and
`scripts/check-css-order.mjs` targets a legacy `build/pages/*.html` output
that no longer exists (wired only at `package.json:38`, in no workflow).

**B. Card-attribute contract declared, unread, and hand-copied 3×.**
`astro-poc/src/lib/product-card-helpers.ts:42-65` builds
`dataAttributes` that **no caller reads**; `ProductCard.astro:37-46`,
`ProductCardStrip.astro:33-42`, `ProductDetail.astro:48-57` each hand-write
the same attribute list; the helper even emits `data-product-has-discount`
and `data-product-discount-percent` that no component renders and the
runtime never reads.

**C. One accent-fold implementation uses raw combining characters.**
`admin/content-manager/src/shared/comms.ts:226` uses a literal
`/[̀-ͯ]/` range (raw U+0300-U+036F chars in source — fragile to editors),
while the other five copies use `\u0300-\u036f` escapes.

## Current state

Quoted in This plan's "Why" section; read each file before editing (all
paths listed in the drift check). Consumers to keep in mind: the orphan
guard allowlist (`tools/guardrails/orphan-assets.allowlist.json` — check
whether any `assets/css` entry exists), `docs/INCIDENTS.md:41` mentions the
legacy CSS as an incident area (update one line), `CODEBASE_MAP.md:13` (plan
232 re-points it at `critical-css.mjs`; this plan removes/re-points again if
the guardrail is deleted).

## Commands you will need

| Purpose    | Command                                           | Provenance | Expected on success |
| ---------- | ------------------------------------------------- | ---------- | ------------------- |
| Install    | `npm ci`                                          | declared   | exit 0              |
| Guardrails | `npm run guardrails && npm run guardrails:assets` | declared   | exit 0              |
| Full tests | `npm test`                                        | declared   | all pass            |
| Build fast | `npm run build:fast`                              | declared   | exit 0              |
| Root lint  | `npm run lint`                                    | declared   | exit 0              |

## Scope

**In scope**:

- Section A: `assets/css/**`, `tools/guardrails/critical-css.mjs`,
  `tools/guardrails/run.mjs`, `scripts/check-css-order.mjs`,
  `package.json` (script entry), `docs/INCIDENTS.md` (one line),
  `docs/architecture/CODEBASE_MAP.md` (row), `astro-poc/scripts/sync-data.mjs`
  only if it lists css explicitly
- Section B: `astro-poc/src/lib/product-card-helpers.ts`,
  the three card components, `test/storefront.catalog-view.spec.js` or the
  plan-231 attribute test
- Section C: `admin/content-manager/src/shared/comms.ts`,
  `admin/content-manager/src/shared/text.ts` (create),
  `admin/content-manager/src/web/app/routes/CategoriesPage.tsx`,
  `admin/content-manager/src/web/app/comms/handoff.ts`

**Out of scope**:

- `astro-poc/src/styles/**` (the live stylesheets).
- Non-admin accent folds (astro-poc/tools copies) — different downstream
  rules per site; only the shared fold primitive is aligned in admin.

## Git workflow

- Branch: `advisor/239-dead-surface`
- Commits: one per section, `chore: … (plan 239)`.

## Steps

### Step 0: Baseline

`npm ci`; `npm run guardrails && npm run guardrails:assets`;
`npm run build:fast`; `npm test`. All green → proceed.

### Step A: Retire the legacy CSS stack

1. Reference sweep — for each of `critical.css`, `style.css`,
   `style-enhanced.css`, `404.css`, `responsive-btn.css`, `app.css`:
   `grep -rn "<name>" --exclude-dir=node_modules --exclude-dir=_archive --exclude-dir=dist .`
   and confirm hits are ONLY: the guardrail, sync copy rules, docs, and
   tests. Any live consumer (Astro template, tool, workflow, Cloudflare) →
   STOP and report.
2. Move the files to `_archive/legacy-css/` (deletion loses the record;
   `_archive/` is the repo's convention for retired surfaces) with a
   one-line README explaining the retirement and the guardrail removal.
3. `tools/guardrails/run.mjs`: remove the critical-css stage (find its
   registration; the file header says it runs in the suite).
   Keep `tools/guardrails/critical-css.mjs` in `_archive` too (or delete —
   choose one and say so).
4. `scripts/check-css-order.mjs` + `package.json:38` entry: delete both.
5. Docs: `INCIDENTS.md` one line; if plan 232 already edited
   `CODEBASE_MAP.md:13` to point at critical-css, update that row to point
   at `astro-poc/src/styles/global.css` instead (the live stylesheet).
6. `astro-poc/scripts/sync-data.mjs`: if it enumerates css explicitly,
   drop those entries; if it copies `assets/` wholesale, the now-empty
   `assets/css/` disappears naturally — no change needed.

**Verify**: `npm run build:fast` → exit 0; `npm run guardrails && npm run guardrails:assets` → exit 0; `npm test` → all pass; `ls assets/css 2>/dev/null` → gone or empty→gone.

### Step B: Single-source the card attributes

Goal: the runtime-visible `data-product-*` set on `<article class="producto">`
is emitted from `product-card-helpers.ts` in all three components, with the
DOM output unchanged for the attributes the runtime reads
(`catalog-view.js:72-116`, `storefront.js:301-303,426-443`). Either:

- **(B1, preferred)** make `dataAttributes` complete (add every key the
  components render today that the runtime reads; drop the two unread keys
  `has-discount`/`discount-percent` ONLY if `grep -rn "dataset.productHasDiscount|dataset.productDiscountPercent|data-product-has-discount|data-product-discount-percent" .` (excl. archives) is empty — it was empty in the audit), and spread `{...card.dataAttributes}` into the `<article>` in `ProductCard.astro`, `ProductCardStrip.astro`, `ProductDetail.astro`; or
- **(B2, fallback)** delete the dead `dataAttributes` field and leave the
  hand-written lists, documenting in the helper why (single-implementation
  no-op).

Pick B1 only if the spread reproduces the current attribute values exactly
(each component may compute values differently — check before spreading;
on any mismatch, take B2 and say so).

Add/extend a unit test asserting the emitted attribute set equals the set
the runtime reads (model: `test/storefront.catalog-view.spec.js` fixture
attributes; plan 231 may already have added an attribute test — extend it).

**Verify**: `npm test` → all pass; `npm run build:fast`; spot-check a built
card's attributes diff against pre-change (build before/after, diff two
product pages — must be identical except any keys you documented as
dropped).

### Step C: Canonical accent fold for the admin

1. Create `admin/content-manager/src/shared/text.ts`:

   ```ts
   // NFD + strip combining marks; always use the escaped range so editors
   // cannot mangle raw combining characters (plan 239).
   export function foldAccents(value: string): string {
     return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
   }
   ```

2. Use it in `shared/comms.ts` (replace the raw-range copy), `handoff.ts`,
   and `CategoriesPage.tsx` — preserving each site's suffix rules
   (`_`/`-`/space/trim) on top of the shared fold.
3. Unit test (contract): accents fold for `ÁÉÍÓÚÜÑñáéíóúü`, idempotence, and
   the exact outputs the three sites relied on (at least one case per site
   from their existing behaviors).

**Verify**: `npm run admin:test` → all pass; `npm run admin:lint` → exit 0.

### Step D: Full gates

**Verify**: `npm test` → all pass; `npm run lint` → exit 0;
`npm run guardrails && npm run guardrails:assets` → exit 0;
`npm run build:fast` → exit 0.

## Test plan

- Section B attribute-set test (B1) or none (B2 with rationale).
- Section C fold test.
- Existing nets: guardrails suite (A), storefront catalog specs (B),
  admin suites (C).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `ls assets/css 2>/dev/null` → empty/none; `grep -rn "critical-css" tools/guardrails/run.mjs` → none
- [ ] `grep -n "check:css-order" package.json` → none; `ls scripts/check-css-order.mjs` → none
- [ ] `grep -rn "critical.css" . --exclude-dir=node_modules --exclude-dir=_archive --exclude-dir=dist --exclude-dir=.git` → only archive/docs hits
- [ ] Section B: either `grep -c "card.dataAttributes\|{...card.dataAttributes}" astro-poc/src/components/ProductCard.astro` ≥ 1 or the B2 rationale comment exists in the helper
- [ ] Section C: `grep -n "u0300" admin/content-manager/src/shared/text.ts` matches; `grep -n "foldAccents" admin/content-manager/src/shared/comms.ts admin/content-manager/src/web/app/routes/CategoriesPage.tsx admin/content-manager/src/web/app/comms/handoff.ts` → 3 imports
- [ ] `npm test` exits 0; `npm run lint` exits 0; guardrails exit 0
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Any live consumer of the legacy CSS files exists (Step A.1).
- The spread (B1) changes any rendered attribute value or the built-HTML
  diff is not explainable (take B2 instead and report).
- A fold-site's behavior changes beyond the fold primitive (report the
  site and its rule).
- A `declared` command fails on the unmodified checkout (Step 0).

## Maintenance notes

- `_archive/` is intentionally out of every guard; the README note there
  is the only breadcrumb.
- If cards gain another component, B1 turns the helper into the single
  edit point — that is the point of the refactor.
- **Deferred:** consolidating the astro-poc/tools fold copies (different
  suffix rules per site; not worth a cross-workspace util today).
