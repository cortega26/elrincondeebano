# 112 — Fix CLAUDE.md (broken commands, Astro 6 framing, missing admin)

- **Source**: Auditoría 9, D3 (DX-3 + DOCS-01)
- **Status**: TODO · **Priority**: P1 · **Effort**: S
- **Stamped against**: `b3805e1`

## Problem

`CLAUDE.md` is the file Claude Code auto-loads first and it is actively
wrong:

- `CLAUDE.md:12` — `npm test` documented as `node test/run-all.js && vitest run`; `test/run-all.js` **does not exist**; actual: `vitest run && npm run admin:test` (`package.json:60`).
- `CLAUDE.md:25,27` — "static Astro 6 site"; actual: `astro-poc/package.json:23` pins `"astro": "7.1.6"`.
- `CLAUDE.md:14` — typecheck described as "Root JS check + astro check"; actual: `typecheck:legacy && typecheck:astro && admin:typecheck` (`package.json:64`).
- `CLAUDE.md:29` — three-tier test description built around `run-all.js`; gone.
- `CLAUDE.md` never mentions `admin/content-manager/` — the canonical admin app.

AGENTS.md:46 acknowledges the file is outdated, but that mitigation does not
reach agents that only load CLAUDE.md.

## Scope

**In**: `CLAUDE.md` only.

**Out**: AGENTS.md (it is current — no change), code.

## Steps

1. Rewrite the Commands section to mirror AGENTS.md's "Comandos clave" table
   (`npm run dev`, `build`, `build:fast`, `test`, `typecheck`, `lint` with
   its admin caveat, `test:e2e`, `validate`, `validate:release`,
   `admin:certify`).
2. Replace both Astro-6 mentions with Astro 7 and the current structure
   (`astro-poc/` storefront + `admin/content-manager/` canónico).
3. Delete the three-tier test description; point to `test/` (vitest root),
   `admin/content-manager/` (vitest + Playwright configs), `test/e2e-astro/`.
4. Add a "verificación de vigencia" note: the file must be re-checked against
   `package.json` scripts whenever `validate`/docs change (one line).

## Tests

- Diff the resulting Commands table against `package.json` scripts — every
  command in CLAUDE.md must exist (script-check by hand or a tiny grep).
- `grep -n "run-all\|Astro 6" CLAUDE.md` → zero hits.

## Done criteria

- [ ] `CLAUDE.md` commands all exist in `package.json` (verified).
- [ ] No `run-all.js` / Astro 6 / Python admin references remain.
- [ ] `npm run validate` green (untouched code paths).

## Maintenance

CLAUDE.md and AGENTS.md should be kept in sync by the Docs Steward agent;
this is the last known drift point after the audit's doc sweep (plans 110,
111 handle the other stale files).

## Rollback

`git revert <sha>`.
