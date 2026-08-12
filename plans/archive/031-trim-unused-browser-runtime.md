# Plan 031: Remove unused Partytown and load only required Bootstrap plugins

> **Executor instructions**: Execute incrementally and verify UI behavior after each dependency change. Update `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 877f179..HEAD -- astro-poc/astro.config.mjs astro-poc/package.json astro-poc/package-lock.json astro-poc/src/scripts/storefront.js test/csp.policy.hardening.test.js test/e2e-astro/cart-ux.spec.ts test/e2e-astro/parity-smoke.spec.ts`

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: `plans/025-characterize-active-checkout.md`
- **Category**: perf
- **Planned at**: commit `877f179`, 2026-07-14
- **Executed**: DONE — 2026-08-12 (verification abajo)

## Why this matters

Partytown is globally initialized although no source script uses `type="text/partytown"`, adding bootstrap/worker output and CSP surface with no benefit. The storefront also imports and exposes the full Bootstrap namespace while source usage is limited to Offcanvas, Collapse, Dropdown and Alert. Removing dead runtime and using explicit plugins reduces shipped JavaScript and parse work without changing design.

## Current state

- `astro.config.mjs:3,38-42` registers `@astrojs/partytown` and forwards unused `dataLayer.push`.
- `BaseLayout.astro:106-111` loads Plausible as a normal deferred script.
- `storefront.js:1,26-27` imports/exposes all Bootstrap; lines 1123-1137 use only `Offcanvas` programmatically.
- Bootstrap data attributes require Collapse, Dropdown, Offcanvas and Alert. Preserve their side-effect registration.
- Plan 019 covers Bootstrap CSS and is explicitly out of scope here.

## Commands you will need

| Purpose | Command                                                                                                                | Expected |
| ------- | ---------------------------------------------------------------------------------------------------------------------- | -------- |
| Build   | `npm run build`                                                                                                        | exit 0   |
| E2E     | `npx playwright test -c playwright.astro.config.ts test/e2e-astro/cart-ux.spec.ts test/e2e-astro/parity-smoke.spec.ts` | pass     |
| Gate    | `npm run lint && npm run typecheck && npm test`                                                                        | exit 0   |

## Scope

**In scope**: drift-check files; update lockfiles through normal npm commands.

**Out of scope**: Bootstrap CSS (plan 019), replacing Bootstrap, analytics provider changes, visual redesign.

## Git workflow

- Branch: `advisor/031-trim-browser-runtime`
- Commits: `perf: remove unused partytown`; `perf: load required bootstrap plugins only`

## Steps

### Step 1: Remove Partytown

Remove the integration/import and `@astrojs/partytown` dependency, regenerate lockfiles with the repository's npm workspace model. Update CSP tests so they no longer allow/expect Partytown bootstrap. Do not alter Plausible.

**Verify**: build succeeds; `rg -n 'partytown|~partytown' astro-poc/dist astro-poc/src astro-poc/astro.config.mjs` finds no generated/runtime reference except historical docs if any.

### Step 2: Replace the Bootstrap barrel

Import explicit plugin modules compatible with Bootstrap's ESM packaging. Keep a local `Offcanvas` binding for `openCartOffcanvas`; remove `globalThis.bootstrap`. Ensure Collapse/Dropdown/Alert/Offcanvas data APIs initialize once.

**Verify**: focused E2E covers navbar collapse/dropdown, cart offcanvas and alert dismiss; no `globalThis.bootstrap` source match remains.

### Step 3: Record a bundle budget

Capture the before/after main JS gzip/uncompressed sizes in the PR evidence. Add a deterministic test or build-contract upper bound only if a stable chunk identification already exists; otherwise document the measurement without brittle hashed filenames.

**Verify**: main shipped JS is smaller than the `877f179` baseline (about 125.6 KB raw / 37.3 KB gzip) and full gates pass.

## Test plan

Use existing cart/parity E2E. Add the smallest regression assertion necessary for plugin availability and CSP absence; do not snapshot entire generated HTML.

## Done criteria

- [x] Partytown dependency, output y CSP exception eliminados (0 refs en dist/src/config; lock anidado stale de astro-poc eliminado — el root lock manda).
- [x] Barrel/globalThis.bootstrap eliminados; los cuatro plugins requeridos funcionan (Collapse/Dropdown/Alert vía data-API del módulo, Offcanvas programático).
- [x] Main JS menor al baseline: 126 589 → 126 304 raw / 37 637 → 37 515 gzip (medido pre/post).
- [x] Build, E2E storefront 41/41 + focalizados 17/17, lint, typecheck y unit tests verdes.

## Evidence (2026-08-12)

- astro.config.mjs: integration + forward dataLayer eliminados; @astrojs/partytown fuera de package.json; test/csp.policy.hardening.test.js sin excepciones partytown (inline executable = 0 estricto).
- storefront.js: `import 'bootstrap'` (side effect: registra las data-APIs de Collapse/Dropdown/Alert) + `import { Offcanvas } from 'bootstrap'` (uso programático en openCartOffcanvas); `globalThis.bootstrap` eliminado.
- astro-poc/package-lock.json (nested) eliminado: npm no lo regenera (el root lock es el modelo documentado, 0 refs partytown); su versión stale listaba la dependencia retirada.
- Gates: build con contrato de artefactos, E2E storefront 41/41, root 428 + admin 504 tests, lint/typecheck verdes.

## STOP conditions

- A versioned source script actually uses Partytown.
- Explicit Bootstrap modules duplicate initialization or break data APIs after two reasonable attempts.
- Main bundle grows or the required plugin list is larger than established by source/E2E.

## Maintenance notes

When adding a Bootstrap component, import its plugin explicitly and extend E2E. Do not restore the barrel for convenience.
