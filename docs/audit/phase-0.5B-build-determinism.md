# Phase 0.5B - Build Determinism Audit

Scope: scripts that (a) write to product_data.json and/or (b) reference local or user-specific paths. For each item: violation, reproducibility impact, patch proposal, and CI guard.

## A) Scripts that write to product_data.json

### A1) tools/generate-image-variants.js

- Violation:
  - Writes to product_data.json using a user-specific OneDrive path by default.
  - Mutates version with a timestamp on every run.
- Why it breaks reproducibility:
  - Build output depends on a file outside the repo and on local filesystem layout.
  - Timestamped version changes make output non-deterministic across runs.
- Patch proposal:
  - Default to repo file: `data/product_data.json`.
  - Allow override only via explicit env or CLI (e.g., `PRODUCTS_JSON` or `--product-data`).
  - Add `NO_VERSION_BUMP=1` or `VERSION_OVERRIDE` to make updates deterministic when needed.
- CI guard:
  - Add a determinism scan that fails if scripts contain OneDrive or `USERPROFILE/HOME` without an allowlist.
  - Add a unit test for default path + override behavior.

### A2) admin/product_manager/repositories.py (JsonProductRepository.save_products)

- Violation:
  - Writes to product_data.json (or configured path) and can target arbitrary paths if config overrides `data_dir`.
- Why it breaks reproducibility:
  - A local config can redirect writes outside the repo, producing undocumented data changes.
- Patch proposal:
  - Keep repo default, but add a guard that refuses paths outside the repo unless `ALLOW_EXTERNAL_DATA_DIR=1`.
  - Log a warning when resolved `data_dir` is outside repo root.
- CI guard:
  - Add a test in `admin/product_manager/tests` that asserts default data path resolves inside repo root.
  - Add a config validation check in CI that rejects external paths unless explicitly allowed.

### A3) server/productStore.js (ProductStore._saveState via applyPatch)

- Violation:
  - Writes to product_data.json and change log files; data path can be overridden via `PRODUCT_DATA_PATH`.
- Why it breaks reproducibility:
  - External path overrides can cause the API to mutate data outside the repo and bypass build inputs.
- Patch proposal:
  - Enforce repo-relative default paths; require `ALLOW_EXTERNAL_DATA_PATH=1` for absolute overrides.
- CI guard:
  - Add a small node test to ensure `createServer()` defaults to repo `data/product_data.json`.

### A4) admin-panel/app.js (exportJSON)

- Violation:
  - Exports a client-side download named `product_data.json` (browser file).
- Why it breaks reproducibility:
  - Not a repo write, but the file name can cause manual overwrite confusion if a user drops it into `data/` without validation.
- Patch proposal:
  - Include metadata in the filename (e.g., `product_data.export.<timestamp>.json`) to avoid silent overwrites.
  - Add a disclaimer banner in the admin panel that exports are not auto-synced to the repo.
- CI guard:
  - Not required for CI; optional snapshot test to ensure the filename pattern.

## B) Scripts that reference external/local user paths

### B1) tools/generate-image-variants.js

- Violation:
  - Uses `process.env.USERPROFILE || process.env.HOME` + OneDrive hard-coded path.
- Why it breaks reproducibility:
  - Assumes a specific user folder layout; fails on CI and non-Windows systems.
- Patch proposal:
  - Remove OneDrive default; use repo-relative `data/product_data.json`.
  - Support explicit override via `PRODUCTS_JSON` or CLI argument.
- CI guard:
  - Determinism scan (grep) for `OneDrive` and `USERPROFILE/HOME` in tooling files.

### B2) tools/prune-backups.js

- Violation:
  - Searches for backups in OneDrive path via `USERPROFILE/HOME`.
- Why it breaks reproducibility:
  - Uses machine-specific locations and can delete files outside the repo without explicit opt-in.
- Patch proposal:
  - Default to repo `data/` only.
  - Allow extra locations via explicit env: `PRUNE_LOCATIONS=path1;path2`.
- CI guard:
  - Determinism scan for OneDrive paths.
  - Add unit test ensuring default locations include repo `data/` only.

### B3) scripts/image_to_webp_converter3.py

- Violation:
  - Default argument hard-coded to `C:/Users/corte/OneDrive/Tienda Ebano/assets/images/`.
- Why it breaks reproducibility:
  - Non-portable default path; fails outside one machine.
- Patch proposal:
  - Default to repo `assets/images/` using `Path(__file__).resolve().parents[1]`.
  - Require explicit `--folder_path` for external locations.
- CI guard:
  - Add a lint check for `C:/Users` and OneDrive strings in scripts.

### B4) admin/product_manager/content_manager.py

- Violation:
  - Uses `os.path.expanduser` on config values (`data_dir`, `log_dir`), enabling `~` paths.
- Why it breaks reproducibility:
  - User home expansion makes paths machine-specific when non-default config is used.
- Patch proposal:
  - Keep expansion but add validation: if expanded path is outside repo root, require `ALLOW_EXTERNAL_PATHS=1` and log a warning.
- CI guard:
  - Add a test ensuring the default config resolves to repo paths and does not use `~`.

## Proposed CI guardrail (single place)

Add a determinism scan script, e.g. `tools/check-determinism-paths.mjs`, that fails if any tooling script includes banned patterns without allowlisting:

- Banned patterns: `OneDrive`, `C:/Users`, `USERPROFILE`, `HOME`, `~`.
- Allowlist: `admin/product_manager/content_manager.py` (only if validated) and documented exceptions.

Wire it into CI (`npm run check:determinism`) before `npm run build` in `.github/workflows/ci.yml`.

