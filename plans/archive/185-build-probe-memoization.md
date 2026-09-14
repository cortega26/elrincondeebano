# Plan 185: Memoize build-time file probes (OG hashes, variant existence)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 0847089c..HEAD -- astro-poc/src/lib/seo.ts astro-poc/src/lib/catalog.ts astro-poc/src/lib/product-card-helpers.ts tools/preflight-hash.mjs`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/170-land-working-tree-baseline.md
- **Category**: perf
- **Planned at**: commit `0847089c`, 2026-09-14

## Why this matters

Every page (~184 product pages + categories + home) re-hashes byte-identical
OG JPEGs (`versionTokenFromFile`: `existsSync` + full `readFileSync` + sha1
per call, no cache) and every product card re-probes variant existence per
width per image. The per-path `VARIANT_EXISTS_CACHE` already softens repeats
within a process, but first-touch still costs ~1,800+ sync stats per build
pass, and the hash gate additionally buffers whole files synchronously while
its state (gitignored `reports/preflight-hashes`) never hits in CI — so CI
pays full hashing + full steps every run. Pure build-time memoization with
zero output change.

## Current state

Relevant files:

- `astro-poc/src/lib/seo.ts` — `versionTokenFromFile` (lines 136–141),
  `resolveOgAssetUrl` (line ~158), category probes (lines 218–224),
  `createSharePreviewMetadata` (line ~280). A `categoryOgManifestCache`
  pattern already exists in-file — mirror it.
- `astro-poc/src/lib/catalog.ts` — `publicAssetExists` (line ~225,
  `existsSync` × roots with `VARIANT_EXISTS_CACHE`), `getResponsiveVariantSet`
  (lines 230–248), `buildVariantAssetPath` (lines ~205–213).
- `astro-poc/src/lib/product-card-helpers.ts` — card calls variant set twice
  (lines 30–32).
- `tools/preflight-hash.mjs` — `hashInputFiles` (lines 20–34, sync full
  `readFileSync`), state in `reports/preflight-hashes` (line ~17, gitignored).

Excerpts (verified by advisor read):

```ts
// seo.ts:136-141 — hash per call, no cache
function versionTokenFromFile(assetPath: string, options?: SeoFileOptions): string | null {
  const filePath = repoAssetPath(assetPath, options);
  if (!fs.existsSync(filePath)) return null;
  return crypto.createHash('sha1').update(fs.readFileSync(filePath)).digest('hex').slice(0, 12);
}
```

```ts
// catalog.ts:225-228 — per-path cache exists (keep + extend, don't remove)
if (VARIANT_EXISTS_CACHE.has(normalized)) {
  return VARIANT_EXISTS_CACHE.get(normalized) || false;
}
const exists = STATIC_ASSET_ROOTS.some((rootPath) => existsSync(path.join(rootPath, normalized)));
```

```js
// preflight-hash.mjs:20-30 — fully buffered sync hashing
hash.update(fs.readFileSync(abs));
```

Conventions: build output must stay byte-identical (determinism CI job
double-builds and diffs hashes — `.github/workflows/ci.yml:105-119`); that
job is the acceptance proof. Measure before/after with a timed
`npm run build:fast` (record wall times in the commit message; no formal
benchmark infra needed).

## Commands you will need

| Purpose      | Command                                  | Provenance | Expected on success                                 |
| ------------ | ---------------------------------------- | ---------- | --------------------------------------------------- |
| Install      | `npm ci`                                 | declared   | exit 0                                              |
| Build (fast) | `npm run build:fast`                     | declared   | exit 0, byte-identical output                       |
| Tests        | `npm test`                               | declared   | all pass (build-contract/metadata tests pin output) |
| Time         | `time npm run build:fast` (before/after) | declared   | faster after, same output                           |

## Scope

**In scope**:

- The four files above (memoization + streaming hash only).
- CI cache wiring for `reports/preflight-hashes` (see Step 3) — config only.

**Out of scope**:

- Gating currently-ungated steps (plan 186), parallel encodes (plan 186),
  payload/entry-point changes (plan 187), determinism-job redesign (plan 189
  discusses it — do not touch the double-build here).

## Git workflow

- Branch: `advisor/185-build-probe-memoization`
- Commit per step; e.g. `perf(build): memoize OG hashes; stream preflight hashing (plan 185)`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 0: Baseline timing + output fingerprint

Time one `npm run build:fast`; fingerprint `astro-poc/dist` (e.g.
`find astro-poc/dist -type f | sort | xargs sha256sum > /tmp/before.sha`).
Record both.

**Verify**: build green; fingerprint saved; otherwise STOP.

### Step 1: Memoize OG version tokens

Module-level `Map` in `seo.ts` keyed by absolute path + `mtimeMs:size`
(mirror `categoryOgManifestCache`): `versionTokenFromFile` checks the map
before hashing. Category probe paths (two files per category) flow through
the same function — no separate change needed.

**Verify**: `npm run build:fast` green; `diff` of new dist fingerprint vs
`/tmp/before.sha` → identical (modulo timestamps — if the build embeds
timestamps, compare with the determinism job's normalization, not raw).

### Step 2: Single directory walk for variant existence

At build start (where the catalog is loaded for rendering — find the single
entry both home and category pages flow through; if none exists, add a
lazily-built shared `Set` in `catalog.ts`), walk the variants roots once
and replace per-card `existsSync` first-touch with set lookups, keeping
`VARIANT_EXISTS_CACHE` as the per-path memo. Card call sites
(`product-card-helpers.ts:30-32`) unchanged.

**Verify**: build green; fingerprint identical; timing recorded.

### Step 3: Stream preflight hashing + cache state in CI

- `hashInputFiles`: stream files (`fs.createReadStream` piped into the hash)
  instead of `readFileSync` (or keep sync for small files with a size
  threshold — document the choice; correctness identical).
- Persist/restore `reports/preflight-hashes` via the existing CI cache
  mechanism (same cache key family as `node_modules` in
  `.github/actions/setup-node-and-deps`, or `actions/cache` on the state dir
  keyed by lockfile — minimal config change). Fresh-runner behavior unchanged
  (miss → run everything).

**Verify**: `npx vitest run test/preflight-hash-gate.test.js` green; build green.

## Test plan

- Existing build-contract/metadata/guardrail tests are the pin (output
  identity); preflight gate tests cover the hasher.
- Add one unit case: repeated `versionTokenFromFile` on the same path hits
  the fs only once (mock `fs` or count via a temp file + mtime change
  invalidates).
- Verification: fingerprint-identical dist + faster wall time + suites green.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run build:fast` exits 0 with byte-identical `dist` vs baseline.
- [ ] Recorded wall time improves (any amount; record numbers in commit).
- [ ] `npm test` exits 0 (incl. new memoization unit case + gate tests).
- [ ] `git diff --name-only 0847089c...HEAD` lists only in-scope files
      (+ CI workflow file if Step 3 touched it — amend scope explicitly).
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report back (do not improvise) if:

- No single entry point exists for the variant-set walk (report the page
  data-flow; do not thread a new parameter through every page).
- The dist fingerprint differs for non-timestamp reasons (correctness over
  speed — report the diff).
- CI has no cache mechanism to reuse for the hash state (record; skip Step 3
  gracefully rather than inventing cache infra).
- Any `declared` command fails on the unmodified checkout.

## Maintenance notes

- Cache keys MUST include mtime+size (never path alone) — stale hashes ship
  stale `?v=` URLs and break cache-busting. Reviewer: check this first.
- If new OG inputs are added, they get memoization free via the shared
  function — no per-call-site work needed.
- **Deferred:** gating ungated steps + parallel encodes → plan 186.
