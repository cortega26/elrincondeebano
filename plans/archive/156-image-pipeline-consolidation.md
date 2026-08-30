# 156 — Consolidate the image pipeline + port the Python OG renderer to Node

- **Source**: Auditoría 10, DEBT-06 + PERF-06 · **Status**: DONE · **Priority**: P3 · **Effort**: L
- **Stamped against**: `ee20b0f6` (2026-08-17) · **Drift check**: `git diff --stat ee20b0f6..HEAD -- tools/ package.json astro-poc/ astro-poc/scripts/ .github/workflows/static.yml`

## Problem

The image pipeline is fragmented across 8+ standalone sharp tools, and one preflight step shells out to a Python sub-pipeline — on a repo whose AGENTS.md declares Node-24-only.

- `package.json` `preflight` chains `images:logo`, `images:avif`, `images:og:home`, `images:og:overrides`, `images:og:categories`, `images:og:parking`, `images:og:clean-overrides`, `gap-fill-image-variants.js`, `preflight.js`. Each re-implements repo-root resolution + sharp load/resize/convert + write-if-changed (compare `sync-avif-assets.js:1-50` with `generate-home-og.mjs:1-50` — `tools/utils/` has no shared image helper).
- `tools/generate-category-og.mjs:27` does `spawnSync(python, ['-m','tools.category_og',...])` — 9 tracked Python files (`tools/category_og/{cli,pipeline,renderer,template,slug,paths,icons}.py`) run on every `npm run build`. That is why `.mypy_cache`/`.ruff_cache`/`.pytest_cache` keep reappearing on disk, and it keeps a second runtime on the critical path.
- Perf: `category_og/renderer.py:49-56` spawns `subprocess.run([node, render_jpg.mjs, ...])` PER image in a sequential loop (`pipeline.py:89-124,211,316-318`) — ~20 Node process startups + sharp warm-up per full build. `generate-images.mjs` (dormant) would serialize 21 encodes per image with no skip-if-exists.
- Width constants are duplicated: `tools/utils/product-mapper.js:5-7` vs `src/js/utils/image-srcset.mjs:6-7`.

## Scope

**In**: A shared `tools/utils/image-pipeline.mjs` (resolve repo → load catalog → for-each sharp op → byte-compare write), the port of `tools/category_og/*.py` to a Node renderer (the renderers are deterministic SVG/JPEG compositions already mirrored by `render_jpg.mjs`/`render_raster_jpg.mjs` inside `tools/category_og/`), `package.json` preflight rewiring, removal of the Python files + `requirements-semgrep.txt` (only if semgrep doesn't use it — check `semgrep.yml`), `.github/workflows/static.yml` determinism expectations.

**Out**: The OG output bytes if they change (determinism CI compares `build-determinism-a/b`, `static.yml:253-255` — if bytes change, regenerate + commit, don't fight the check), `tools/category_og/` Python if kept as reference, `src/js/utils/image-srcset.mjs` (plan 155 deletes it).

## Steps

1. **Shared helper**: build `tools/utils/image-pipeline.mjs` with the common operations (repo-root resolution, catalog loading, image-path derivation, load→resize→convert→write-if-changed with byte compare). Migrate the sharp-based tools onto it one at a time (`sync-avif-assets.js`, `gap-fill-image-variants.js`, `generate-*.mjs`), keeping outputs byte-identical — the determinism check in `static.yml` is the gate.
2. **Node OG renderer**: port `tools/category_og/*.py` to Node (a single renderer module; batch all category renders into ONE Node invocation — kills the ~20-process spawn cost of PERF-06). Wire `generate-category-og.mjs` to it, delete the Python files, and remove `python3` from the preflight path. Add skip-if-exists to `generate-images.mjs` and use single-decode-then-clone.
3. **Unify constants**: move the image-width/srcset constants into `tools/utils/image-pipeline.mjs` (or a `tools/utils/constants.js`) and import from both tools and (until plan 155) the astro-poc side.
4. Run the determinism check explicitly: `npm run check:determinism` and, if CI's build-determinism compares two builds, run both build paths locally and diff.

## Tests

- The tools tests under `test/` (`image-pipeline.paths.test.js`, `astro-responsive-images.spec.js`, `astro-catalog-image-url.spec.js`, `gap-fill-image-variants.config.test.js`, `cfimg.config.test.js`) must pass; where a test asserted the Python invocation, update it to the Node renderer in the same commit.
- `npm run build` green (full preflight — this is the pipeline's own verification).
- `npm run lint` + `npm run typecheck` green.

## Done criteria

- [ ] No `python`/`spawnSync(python` in the preflight path (grep tools/ for `python` → only historical/doc references).
- [ ] `tools/category_og/*.py` deleted.
- [ ] The sharp tools share `image-pipeline.mjs` (no re-implemented repo-root/sharp logic in the migrated tools).
- [ ] `npm run build` green; `check:determinism` green; `npm run validate` green.

## Maintenance

The determinism CI (`static.yml:253-255`) is the contract that keeps the pipeline's output stable; any future image format change regenerates + commits. A reviewer should confirm the OG bytes are identical or, if different, that the regeneration commit is part of THIS plan (never silently divergent).

## Rollback

`git revert <sha>` (per phase; the Python port is the riskiest phase — revert it first if a determinism failure can't be resolved).

## STOP conditions

- If porting the OG renderer produces different bytes and the difference is NOT visually acceptable, stop and report — do not commit byte drift silently.
- If `semgrep.yml` actually requires `tools/requirements-semgrep.txt`/Python, stop and report before touching it.
