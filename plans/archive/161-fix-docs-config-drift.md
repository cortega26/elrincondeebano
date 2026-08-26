# 161 — Fix the docs/config drift batch (commands, credential, ports, CI claims, dead config)

- **Source**: Auditoría 10, DX-01..08 + DEP-04 · **Status**: DONE · **Priority**: P2 · **Effort**: S-M
- **Stamped against**: `ee20b0f6` (2026-08-17) · **Drift check**: `git diff --stat ee20b0f6..HEAD -- admin/content-manager/README.md docs/ README.md AGENTS.md CLAUDE.md scripts/smoke-checklist.mjs .pa11yci.json .github/actions/setup-node-and-deps/action.yml tools/inject-resource-hints.js package.json`

## Problem

Eight verified doc/config inconsistencies (all S-effort, all HIGH-confidence — batched here because they are the same class: claims that contradict the code). Each one actively misleads:

1. **Broken documented command** — `admin/content-manager/README.md:15` documents `npm run admin:dev:web`; that script does not exist (the real one is `dev:web` in the workspace). Either add the root alias or fix the doc.
2. **Credential is NOT printed in the startup log anymore** (plan 125/127 F3.5) — three docs + one comment still say it is: `admin/content-manager/README.md:38-39`, `docs/onboarding/LOCAL_DEV.md:53-54`, `docs/operations/RUNBOOK.md:148`, and `admin/content-manager/src/server/app.ts:68-71`. Truth: written to `data/.admin-credential` (0600) or via `ADMIN_CREDENTIAL` (`start.ts:72-82`); `.env.example:24` already documents it correctly.
3. **Smoke port mismatch** — `scripts/smoke-checklist.mjs:1` defaults to `4173`; `docs/operations/SMOKE_TEST.md:10-11` and `RUNBOOK.md:238` say `serve astro-poc/dist -l 4174`. Align both on one port + document `SMOKE_BASE_URL`.
4. **`npm run validate` composition wrong in 4 docs** — actual (`package.json:74`): `lint && typecheck && check:e2e-selectors && build && test && check:plans && guardrails:assets`. AGENTS.md:40, CLAUDE.md:21, README.md:52, VALIDATION_MATRIX.md:15-22 omit `check:plans` and/or mis-order.
5. **"Fast local baseline" mislabel** — VALIDATION_MATRIX.md:10 + START_HERE.md:11,33 call `validate` "fast"; it runs the full slow build (AGENTS.md:35 itself says "Lento"). Rename the tier + document a lint/typecheck/test-only loop.
6. **`.pa11yci.json` is dead** — pa11y-ci removed in plan 113; no script/workflow runs it. Delete it (or wire a scan; deletion is the net-positive default).
7. **README presents retired Python as active fallback** — `README.md:15` mentions `admin/product_manager/` "fallback durante la ventana de transición" — the dir doesn't exist (plan 069 retired it; rollback tag `v1.x-python-final`). Fix to point at `content-manager` only.
8. **RUNBOOK ci.yml triggers + validate:release claims wrong** — `RUNBOOK.md:205` says CI excludes `admin/**`; `ci.yml:3-8` has no paths filter. AGENTS.md:41/CLAUDE.md:22 say `validate:release` adds a "security audit" stage; `tools/validate-release.mjs:3-39` has none (audits live in the separate `security-audit.yml`).
9. **Stale CI cache path + dead CDN hints** (DEP-04) — `.github/actions/setup-node-and-deps/action.yml:30-32` lists `astro-poc/package-lock.json` which doesn't exist; `tools/inject-resource-hints.js:12-13` emits dns-prefetch for jsdelivr/cdnjs that nothing loads.

## Scope

**In**: Exactly the files in the drift check. `tools/inject-resource-hints.js` (delete the two dead hints), `.github/actions/setup-node-and-deps/action.yml` (delete the nonexistent lockfile path), `.pa11yci.json` (delete), `.gitignore` (add `data/sync-config.json` — no, that's plan 139; do NOT add it here).

**Out**: Anything not listed. No behavior changes to the scripts beyond the smoke port default.

## Steps

1. Fix each item as described. For #1 prefer ADDING the root alias `"admin:dev:web": "npm -w admin/content-manager run dev:web"` to `package.json` (keeps the README true and the command discoverable). For #4 update all four docs to the exact composition. For #8 reword AGENTS.md/CLAUDE.md to "release gate + e2e + live share-preview probe (audits run separately in security-audit.yml)".
2. Grep after each edit for the stale phrase to catch stragglers (`printed once in the startup log`, `admin:dev:web`, `cdns`/`jsdelivr`, `product_manager`).

## Tests

- `npm run validate` composition itself is unchanged (this plan only fixes the docs' description of it) — verify the docs now match `package.json:74` line-for-line.
- `npm run lint` green (doc formatting via prettier pre-commit).
- Quick sanity: `npm run admin:dev:web -- --help`-style dry check that the alias resolves (or at least `npm run admin:typecheck` still green).

## Done criteria

- [ ] `grep -rn "startup log\|admin:dev:web\|jsdelivr\|cdnjs\|product_manager.*fallback" README.md admin/content-manager/README.md docs/ AGENTS.md CLAUDE.md` → no stale hits (allow historical CHANGELOG/audit references).
- [ ] AGENTS.md + CLAUDE.md + README.md + VALIDATION_MATRIX.md describe `validate` exactly as `package.json:74`.
- [ ] `.pa11yci.json` deleted; `smoke-checklist.mjs` default port matches the docs; CI action no longer lists a nonexistent lockfile.
- [ ] `npm run lint` green.

## Maintenance

The repo's doc-gardening practice is standing; this batch closes the drift found at HEAD `ee20b0f6`. When `validate` composition changes again, update all four docs in the same commit (the recurring rule).

## Rollback

`git revert <sha>` (pure doc/config; safe).

## STOP conditions

- If any workflow or script actually references `.pa11yci.json` (audit says none do — re-verify), stop and report before deleting.
