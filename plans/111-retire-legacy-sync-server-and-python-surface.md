# 111 — Retire the legacy sync server and close the Python-era surface

- **Source**: Auditoría 9, D2 (TDA-04 + SEC-03 + TEST-04 nexus) + DOCS-02/03/05 + DX-8
- **Status**: TODO · **Priority**: P1 · **Effort**: S
- **Stamped against**: `ccb921f`
- **Depends on**: plan 108 (durability tests ported to AtomicWriter) — the legacy `server/productStore.js` durability suite must have a live home before its legacy host is deleted.

## Problem

The Python/Streamlit retirement (plan 069) left a littered surface:

**Live-risk legacy server**: `server/httpServer.js` (the legacy "production
Sync API") is unreferenced by `package.json`/workflows, yet remains runnable
(`node server/httpServer.js`) and its patch-auth defaults to OFF outside
production:

```js
// server/httpServer.js:70-73 — requirePatchAuth defaults to NODE_ENV === 'production'
// :109-130 — auth skipped entirely when false
// :544 — server.listen(port) with no host (binds all interfaces) while :545 logs 127.0.0.1
```

It writes `data/product_data.json` via `PATCH /api/products/*`. Any host on
the network can overwrite the catalog when this is started with defaults —
and `docs/architecture/CODEBASE_MAP.md` still documents it as the production
Sync API.

**Stale gates/ignores/docs**:

- `plans/README.md:472` — "Gate residual: pytest + ruff desde
  `admin/product_manager/`" — `admin.yml` has zero pytest/ruff jobs.
- `.gitignore:56-57` — un-ignore rules for `admin/product_manager/tests/` (sources gone).
- Tracked dead scripts: `tools/migrate-to-sqlite.py`, `scripts/image_to_webp_converter3.py`,
  `scripts/python_quality.ps1`, `scripts/fix_python_lint.ps1`; `docs/repo/STRUCTURE.md:84`
  lists them (plus `run-cypress.mjs`, deleted in plan 001) as current.
- `docs/repo/STRUCTURE.md:33,70` — `admin/` described as the Python desktop manager.
- `docs/architecture/CODEBASE_MAP.md:103` — `admin.yml` described as "Python pytest".
- `docs/archive/streamlit-retirement-notice.md:27-31` — "Python Tkinter manager remains active" (contradicts the retirement it records).
- `.env.example:24` — points at the retired `admin/product_manager/content_manager.py`.
- `docs/onboarding/LOCAL_DEV.md:8,59` — Python 3.12 optional dep + `node test/run-all.js` claims.

## Scope

**In**: `server/` (delete: `httpServer.js`, `productStore.js`, and any other
files under `server/` — verify with `git ls-files server/`), the legacy
`test/product-store.durability.test.js` and any tests only exercising
`server/*`, `.gitignore`, `plans/README.md`, the docs listed above, `.env.example`.

**Out**: `admin/content-manager/` (the canonical manager), the storefront, live CI.

## Steps

1. Verify plan 108 landed: AtomicWriter suite green, so the legacy
   `productStore` durability tests can be deleted without losing coverage.
2. Inventory `server/`: `git ls-files server/` → delete all files; find
   remaining references (`grep -rn "server/httpServer\|server/productStore\|require('./server\|from './server" . --include="*.js" --include="*.json" --include="*.md" --include="*.mjs"`) → update or delete; confirm `package.json` has no script referencing `server/`.
3. Delete the tracked Python/PS1 scripts listed above and the
   `.gitignore:56-57` rules.
4. Fix `plans/README.md:472` (remove the pytest/ruff gate row), `STRUCTURE.md`
   (`:33,70,84,110`), `CODEBASE_MAP.md:103` (admin.yml = TypeScript Content Manager CI), `streamlit-retirement-notice.md:27-31` (actual outcome: retired 2026-08-11, plan 069, rollback tag `v1.x-python-final`), `.env.example:24`, `LOCAL_DEV.md`.
5. Optional local hygiene: `rm -rf admin/web admin/product_manager` (they hold only gitignored bytecode — do this locally, not in the commit).

## Tests

- `grep -rn "httpServer\|productStore\|pytest\|ruff\|run-cypress\|run-all" package.json .github/ docs/ plans/ README.md AGENTS.md CLAUDE.md` — zero hits (except intentional history references).
- `npm run validate` green (nothing live referenced the deleted modules — verify `npm test` doesn't collect `test/product-store.durability.test.js` anymore).
- `npm run admin:certify` green.

## Done criteria

- [ ] `git ls-files server/` empty; no `.py`/`.ps1` tracked in scripts/tools.
- [ ] No doc/README claims the Python manager, pytest/ruff gate, or legacy Sync API as current.
- [ ] `npm run validate` + `admin:certify` green.

## Maintenance

The rollback boundary for the whole Python era is the tag
`v1.x-python-final` (plan 069). This plan only removes surface; if the
legacy Sync API is ever needed again, it is one revert away from
`v1.x-python-final`.

## Rollback

`git revert <sha>` restores every deleted file; the live server
(`admin/content-manager`) is untouched by this plan, so rollback is
zero-risk to production.
