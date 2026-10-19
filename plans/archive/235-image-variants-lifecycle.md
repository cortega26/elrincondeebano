# Plan 235: Image variants lifecycle — recursive dist prune, aligned width sets, repo cleanup

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 97b21096..HEAD -- astro-poc/scripts/postbuild-prune-unreferenced-images.mjs tools/utils/constants.js tools/gap-fill-image-variants.js test/postbuild-prune-manifest.test.js test/gap-fill-image-variants.config.test.js`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S–M (Steps 1-2) / M (optional Step 3)
- **Risk**: MED
- **Depends on**: none; coordinates with plan 222 (images workflow) — no file overlap
- **Category**: perf
- **Planned at**: commit `97b21096`, 2026-10-18

## Why this matters

Measured in the audit: `variants/w100 + w600 + w800 + w1200` ≈ 50 MB, with
**zero references** from any built HTML/JS/CSS/JSON (grep-verified); only
w200/320/400/480/640 are referenced. They ship in every deploy because the
prune script only inspects direct files inside `dist/assets/images/<cat>/`
and skips directories — the nested `variants/` trees are never reached —
and the orphan guard ignores `variants` entirely
(`tools/guardrails/orphan-assets.allowlist.json:2`). Separately, the
variant generators disagree on widths: gap-fill writes
`[200,400,600,800,1200]` while the UI requests `[200,320,400,480,640]`
(`tools/utils/constants.js:10,14`; consumers in `astro-poc/src/lib/catalog.ts:81-82`),
so 22 products have variants that top out at w400 while three of the six
generated widths are dead weight.

## Current state

`astro-poc/scripts/postbuild-prune-unreferenced-images.mjs:126-140`:

```js
for (const category of readdirSync(imagesRoot, { withFileTypes: true })) {
  if (!category.isDirectory()) continue;
  const categoryPath = join(imagesRoot, category.name);
  for (const file of readdirSync(categoryPath, { withFileTypes: true })) {
    if (!file.isFile()) continue;          // ← variants/ skipped here
    const rel = `assets/images/${category.name}/${file.name}`;
    if (referenced.has(rel)) continue;
    ...
    unlinkSync(absolute);
```

`tools/utils/constants.js:9-16`:

```js
const PRODUCT_IMAGE_WIDTHS = Object.freeze([200, 320, 400, 480, 640]);
const GAP_FILL_WIDTHS = Object.freeze([200, 400, 600, 800, 1200]);
const GENERATE_IMAGE_WIDTHS = Object.freeze([200, 400, 600, 800, 1200, 1600, 2000]);
```

`tools/gap-fill-image-variants.js:5-6,29-33` — writes
`variants/w<width>/images/<category>/<file>` from `GAP_FILL_WIDTHS` and
records `image_variants` in `data/product_data.json`; consumers derive the
srcset from **file presence** (`astro-poc/src/lib/catalog.ts`), so removing
a width's files is safe for rendering.

Existing nets: `test/postbuild-prune-manifest.test.js` (plan 215 icon
regression), `test/gap-fill-image-variants.config.test.js`,
`npm run guardrails:assets` (orphan assets), `npm run lint:images`.

## Commands you will need

| Purpose     | Command                                                                  | Provenance | Expected on success |
| ----------- | ------------------------------------------------------------------------ | ---------- | ------------------- |
| Install     | `npm ci`                                                                 | declared   | exit 0              |
| Build       | `npm run build` (full; gap-fill/prune run here)                          | declared   | exit 0              |
| Prune tests | `npx vitest run test/postbuild-prune-manifest.test.js`                   | declared   | all pass            |
| Guardrails  | `npm run guardrails && npm run guardrails:assets && npm run lint:images` | declared   | exit 0              |
| Full tests  | `npm test`                                                               | declared   | all pass            |

## Scope

**In scope**:

- `astro-poc/scripts/postbuild-prune-unreferenced-images.mjs`
- `tools/utils/constants.js` (width sets)
- `tools/gap-fill-image-variants.js` (stale-entry pruning)
- `test/postbuild-prune-manifest.test.js`, `test/gap-fill-image-variants.config.test.js`
- `assets/images/variants/w100`, `w600`, `w800`, `w1200` (deletion — Step 3)
- `data/product_data.json` (via the gap-fill run, not hand-edits)

**Out of scope**:

- `astro-poc/src/lib/catalog.ts` consumers (already request the canonical
  widths).
- The orphan-guard allowlist (leave `variants` ignored — the prune is the
  enforcement).
- `tools/generate-images.mjs` (retired).

## Git workflow

- Branch: `advisor/235-image-variants`
- Commits: `perf(images): recursive variant prune (plan 235)` etc.

## Steps

### Step 0: Establish a green baseline

`npm ci`, `npm run build`, and `ls astro-poc/dist/assets/images/variants/`
must exist. Then run the prune tests. Red → STOP.

### Step 1: Recursive dist prune

Replace the two-level walk with a recursive walk under `imagesRoot`:

```js
function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
      continue;
    }
    const rel = relative(imagesRoot, full).split(sep).join('/');
    const assetRel = `assets/images/${rel}`;
    if (referenced.has(assetRel)) continue;
    freed += statSync(full).size;
    unlinkSync(full);
    removed += 1;
  }
}
walk(imagesRoot);
```

Keep the log line/report shape. After a fresh `npm run build`, confirm:
`find astro-poc/dist/assets/images/variants -name '*.webp' | grep -E 'w(100|600|800|1200)/'` → empty, while w200/320/400/480/640 files referenced by HTML remain. Add a regression test to `postbuild-prune-manifest.test.js` style: fixture with a nested unreferenced variant + a referenced one; assert only the unreferenced one is deleted. (The existing test composes the collect* functions; extend it with a temp-tree fixture if the current shape allows, else add a focused test for the walker exported from the script.)

**Verify**: build + find command + `npx vitest run test/postbuild-prune-manifest.test.js` → all pass.

### Step 2: Align the width sets

- `tools/utils/constants.js`: `GAP_FILL_WIDTHS = [200, 320, 400, 480, 640]`
  (match `PRODUCT_IMAGE_WIDTHS`; keep the frozen arrays and the
  plan-156 single-source comment updated).
- `tools/gap-fill-image-variants.js`: when it rewrites a product's
  `image_variants`, **drop entries whose width is not in the canonical set**
  (union `PRODUCT_IMAGE_WIDTHS`, in case hero widths ever join) — one small
  filter where the array is built.
- Run `node tools/gap-fill-image-variants.js` and inspect `git status`: it
  should add missing 320/480/640 files for the ~22 gap-fill products, and
  rewrite `data/product_data.json` without the dead widths.
- Update `test/gap-fill-image-variants.config.test.js` to assert the script's
  width source equals `PRODUCT_IMAGE_WIDTHS` (import both constants).

**Verify**: `npm run build` → exit 0; `npm test` targeted gap-fill/prune
tests pass; `grep -c '"width": 600' data/product_data.json` → 0 (adjust the
actual JSON shape you find).

### Step 3: Repo cleanup (the ~54 MB tracked set)

Only after Steps 1-2 are green:

```bash
git rm -r assets/images/variants/w100 assets/images/variants/w600 \
          assets/images/variants/w800 assets/images/variants/w1200
```

Then re-run `npm run build` + `npm test` + `npm run guardrails:assets`
(the orphan guard ignores `variants`; the build regenerates public copies).

If the operator prefers to keep repo files until CI verifies the deploy
slim-down, STOP after Step 2 and say so — Steps 1-2 are the deploy win;
Step 3 is clone/checkout weight.

**Verify**: `du -sh assets/images/variants` drops by ~50 MB;
`git status` shows only deletions + the JSON/organic files from Step 2.

### Step 4: Full gates

**Verify**: `npm run build` → exit 0; `npm test` → all pass;
`npm run guardrails && npm run guardrails:assets && npm run lint:images` →
exit 0; `npm run test:e2e` (rebuild) → green.

## Test plan

- Prune recursion regression (Step 1).
- Width-source assertion in `gap-fill-image-variants.config.test.js`
  (Step 2).
- Existing e2e image/picture specs are the behavior net.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `find astro-poc/dist/assets/images/variants -name '*.webp' -path '*w1200*'` after a build → empty
- [ ] `grep -n "200, 320, 400, 480, 640" tools/utils/constants.js` shows both PRODUCT_IMAGE_WIDTHS and GAP_FILL_WIDTHS
- [ ] `npm test` exits 0; guardrails exit 0
- [ ] (Step 3) `du -sh assets/images/variants` ≤ 26 MB
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Any HTML/JS/CSS/JSON reference to a w100/w600/w800/w1200 path is found
  (the audit measured zero — if you find one, the premise is false; report
  the file).
- The recursive prune deletes something the asset contract requires
  (`npm run guardrails:assets` fails after a build) — report the file list.
- `data/product_data.json` `image_variants` proves to be read for widths
  outside the canonical set by some consumer you find (report).
- A `declared` command fails on the unmodified checkout (Step 0).

## Maintenance notes

- The canonical width set lives in `tools/utils/constants.js`; consumers
  (`catalog.ts`) and generators must import it, never re-declare widths.
- Reviewer: diff the freed-bytes report in the build log before/after;
  confirm JSON-LD image references to originals are still intact (the prune
  keeps data-referenced files).
- **Deferred:** re-checking the orphan-guard allowlist for `variants` once
  the prune owns recursion (allowlist entry can stay; it guards the
  guard).
