# Plan 186: Gate, parallelize, and unify the image pipeline

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 0847089c..HEAD -- package.json tools/sync-avif-assets.js tools/gap-fill-image-variants.js tools/generate-category-og.mjs tools/generate-images.mjs tools/utils/image-pipeline.mjs astro-poc/src/lib/catalog.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/170-land-working-tree-baseline.md, plans/185-build-probe-memoization.md
- **Category**: perf
- **Planned at**: commit `0847089c`, 2026-09-14

## Why this matters

Every `npm run build` pays full AVIF/OG/gap-fill scans plus a catalog rewrite
even when inputs are unchanged (`sync-avif-assets.js` unconditionally
`writeFileSync`s the products JSON, invalidating downstream mtime caches);
hundreds of sharp encodes run strictly serially (wall time = sum of all
encodes); and `generate-images.mjs` emits `{base}-{w}.{ext}` width-suffixed
files while gap-fill and the storefront resolver (`buildVariantAssetPath` +
`publicAssetExists`) use the `w{W}/images/<rel>/<base>.<ext>` no-suffix
layout — so batch-generate output is never found by the resolver (wasted
encodes, missing srcsets). One pipeline plan: gate, parallelize, converge.

## Current state

Relevant files:

- `package.json:29` — preflight chain; gated steps use `preflight-hash.mjs`,
  but `images:og:categories` and `images:gap-fill` are ungated.
- `tools/sync-avif-assets.js:84-117` — serial `await ensureAvifAsset`,
  unconditional `writeFileSync(productsJsonPath, ...)` at line ~117.
- `tools/gap-fill-image-variants.js` — local `variantExists` (line ~28,
  duplicate of `image-pipeline.mjs:56`), nested
  `for w / for ext await buildVariant` (lines ~78–84), `SKIP_IMAGE_OPT`
  escape hatch (line ~55).
- `tools/generate-images.mjs:25-61` — hand-rolled single-decode clone loop
  emitting `${base}-${w}.avif/webp/ext` (lines ~32–36), serial
  `for (const f of files) await buildVariants(f)` (lines ~71–73).
- `tools/utils/image-pipeline.mjs:56-110` — canonical `variantExists` /
  `buildVariantPath` (`w{W}/images/...`, no width suffix) and
  `generateVariantsSingleDecode` (zero callers outside the file — verified).
- `astro-poc/src/lib/catalog.ts:205-213` — resolver expects the
  `w{W}/images/...` layout (plan 119: "no width suffix allowed").

Excerpts (verified by advisor read):

```js
// generate-images.mjs — width-suffixed layout (orphan output)
const outAvif = path.join(outDir, `${base}-${w}.avif`);
```

```js
// gap-fill buildVariant — canonical layout
const outDir = path.join(variantsRoot, `w${width}`, 'images', relDir);
const out = path.join(outDir, `${base}.${ext}`);
```

```js
// image-pipeline.mjs:56-63 — canonical helper gap-fill duplicates
export function variantExists(variantsRoot, imagePath, width, ext) { ... }
```

Conventions: `writeBufferIfChanged` byte-compare writes keep output
byte-identical (determinism job is the proof); `SKIP_IMAGE_OPT=1` /
`PREFLIGHT_SKIP_OG=1` escape hatches stay; plan 156 owns the pipeline's
current shape — stay consistent with it.

## Commands you will need

| Purpose | Command         | Provenance | Expected on success                                   |
| ------- | --------------- | ---------- | ----------------------------------------------------- |
| Install | `npm ci`        | declared   | exit 0                                                |
| Build   | `npm run build` | declared   | exit 0                                                |
| Tests   | `npm test`      | declared   | all pass (image-pipeline/og-metadata/guardrail tests) |

## Scope

**In scope**: the files above (gates, pool, layout converge, dedupe).

**Out of scope**: sharp version/options tuning; new variants/widths; CDN
cache invalidation (operator concern — note in commit if layout changes
invalidate cached assets); `category_og` (already Node-ported per plan 156).

## Git workflow

- Branch: `advisor/186-image-pipeline-gates-parallel`
- Commit per step (gate → parallel → converge); e.g.
  `perf(images): gate avif/og/gap-fill on content hash (plan 186)`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 0: Baseline

Requires plans 170 + 185 DONE. Time one full `npm run build`; fingerprint
`assets/images/variants` + `assets/images/og` listings + the products JSON
bytes. Record.

**Verify**: green build; fingerprints saved; otherwise STOP.

### Step 1: Gate the ungated steps + write-if-changed catalog

- Wrap `images:avif`, `images:og:categories`, `images:gap-fill` in
  `preflight-hash.mjs` gates with declared `--inputs`/`--outputs` (follow
  the existing `images:logo` pattern in `package.json:42`).
- `sync-avif-assets.js`: compare serialized JSON with the on-disk bytes and
  skip the write when identical (write-if-changed).

**Verify**: two consecutive `npm run build` → second run skips the three
steps (gate log lines) and leaves the JSON mtime untouched; tests green.

### Step 2: Bounded parallel encodes

Route per-file/per-variant encodes through a bounded pool (size
`os.cpus().length`, reuse/extend `tools/run-parallel.mjs` or a small pool
helper — do not use unbounded `Promise.all`, peak memory/FD risk). Apply to
`generate-images.mjs` file loop, gap-fill variant loop, and sync-avif
per-product loop. Keep single-decode-clone per file.

**Verify**: build green; dist + variants byte-identical to baseline
fingerprint; wall time recorded (must improve on image-heavy fixture or at
least not regress; CI runners vary — record, don't gate).

### Step 3: Converge on one layout; dedupe helpers

- Decide (verify against the resolver + a real build): the
  `w{W}/images/<rel>/<base>.<ext>` layout is canonical. Migrate
  `generate-images.mjs` to emit it via the shared `buildVariantPath` (or
  retire `generate-images.mjs` if gap-fill + sync-avif fully cover its role
  — check `package.json` wiring first; if nothing invokes it in preflight,
  retire, don't migrate).
- `gap-fill-image-variants.js`: import `variantExists` from
  `image-pipeline.mjs` instead of the local copy.
- `generateVariantsSingleDecode`: wire callers to it or delete it (zero
  orphaned helpers either way).

**Verify**: build green; previously-missing srcsets now resolve (spot-check
a generated variant URL against the resolver); tests green.

## Test plan

- Existing image-pipeline/OG-metadata/orphan-asset/guardrail tests pin
  output; gate tests (plan 170's) pin skip behavior.
- Add: gate skip/no-skip unit cases for the three newly gated steps; a
  resolver test asserting batch-generated variants are found (fails before
  Step 3, passes after).
- Verification: full `npm test` + identical output fingerprints.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] Second consecutive `npm run build` skips unchanged image steps.
- [ ] Output fingerprints (dist, variants, og, products JSON) identical to baseline.
- [ ] `grep -n "function variantExists" tools/gap-fill-image-variants.js` returns no matches (shared helper used).
- [ ] No `{base}-{w}.` emitters remain (or the file is retired with wiring removed).
- [ ] `npm test` exits 0.
- [ ] `git diff --name-only 0847089c...HEAD` lists only in-scope files.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report back (do not improvise) if:

- The resolver actually reads the width-suffixed layout somewhere (then the
  "canonical" premise is wrong — report both layouts' readers).
- Parallel encodes OOM or exhaust FDs on this machine (reduce pool, record;
  if still failing, keep serial + gates and report).
- Retiring `generate-images.mjs` breaks a workflow outside `package.json`
  (docs/CI reference — report instead).
- Any `declared` command fails on the unmodified checkout.

## Maintenance notes

- New image steps MUST ship with a `preflight-hash.mjs` gate from day one —
  add that sentence to the preflight docs where the existing gates are
  described.
- If the layout migration invalidates CDN-cached variant URLs, say so
  loudly in the commit message (operator may need cache purge).
- Reviewer: verify pool size choice against the smallest CI runner, not the
  dev machine.
- **Deferred:** sharp option tuning (quality/size) — needs perceptual review,
  not a perf plan.
