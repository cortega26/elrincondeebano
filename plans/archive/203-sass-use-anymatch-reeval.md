# Plan 203: Migrate Sass @import to @use; re-evaluate the vendored anymatch fork

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 0847089c..HEAD -- astro-poc/src/styles/bootstrap-needed.scss astro-poc/public/assets/css/app.css package.json astro-poc/package.json astro-poc/vendor/anymatch/`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/170-land-working-tree-baseline.md
- **Category**: migration
- **Planned at**: commit `0847089c`, 2026-09-14

## Why this matters

`@import` is deprecated since Dart Sass 1.80.0 with removal scheduled for
the 3.0 line — the repo (on `sass-embedded ^1.100.0`) pays noisy deprecation
warnings today and a hard build break on the Sass 2.x→3.x upgrade. The
repo's own 24 `@import` lines are mechanical to migrate; Bootstrap's
_internal_ `@import` usage stays (frozen by design until Bootstrap 6), so
this buys a partial silence plus future-proofing, not zero warnings.
Separately, the vendored `anymatch` fork (frozen upstream since Nov 2022)
costs a permanent `npm pack` + `check-vendor-tgz.mjs` maintenance dance for
a dedupe win that no longer covers the whole closure (two `chokidar` majors
still ship), with a stale README misdirecting the next editor — re-evaluate
on Astro 7 before carrying it forever.

## Current state

Verified by advisor read:

```scss
// astro-poc/src/styles/bootstrap-needed.scss:3-26 — 24 lines
@import 'bootstrap/scss/functions';
@import 'bootstrap/scss/variables';
... (maps, mixins, utilities, root, reboot, type, images, containers, grid,
buttons, forms, navbar, nav, offcanvas, dropdown, alert, badge, card, close,
transitions, helpers, utilities/api)
```

```css
// astro-poc/public/assets/css/app.css:1-2
@import '../../node_modules/bootstrap/dist/css/bootstrap.min.css';
@import './style.css';
```

```json
// astro-poc/package.json:22
"anymatch": "file:vendor/anymatch/anymatch-3.1.3.tgz",
// astro-poc/vendor/anymatch/README.md:5 — "Astro 6.4.4 depends on picomatch@^4.0.4" (repo runs astro 7.1.6)
// lock: single picomatch 4.0.5, zero micromatch (fork's dedupe worked) BUT chokidar 4.0.3 vs 2× chokidar 5.0.0 (split persists)
```

Conventions: plan 160 owns the vendor drift guard (`check-vendor-tgz.mjs`

- `check-determinism`) — any fork-content change must go through the
  re-pack dance; visual output must be byte-identical (Astro build + E2E
  visual-adjacent specs are the proof).

## Commands you will need

| Purpose  | Command                                                              | Provenance | Expected on success                    |
| -------- | -------------------------------------------------------------------- | ---------- | -------------------------------------- |
| Migrate  | Sass module migrator (`npx sass-migrator module ...`, dry-run first) | declared   | shows namespaced rewrite               |
| Build    | `npm run build:fast`                                                 | declared   | exit 0, byte-identical CSS             |
| Tests    | `npm test`                                                           | declared   | all pass                               |
| E2E spot | `npm run test:e2e` (or PLAYWRIGHT_SKIP_BUILD=1 rerun)                | declared   | pass (visual regressions surface here) |

## Scope

**In scope**: the 2 style files (+ CI fatalDeprecation guard); anymatch
spike on a scratch checkout + README correction either way.

**Out of scope**: Bootstrap internals (frozen); Bootstrap 6 upgrade;
removing the fork without the spike's evidence; Sass version bump.

## Git workflow

- Branch: `advisor/203-sass-use-anymatch-reeval`
- Two commits (sass migration; anymatch verdict+README).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 0: Baseline

`build:fast` green; fingerprint compiled CSS bytes (`astro-poc/dist` CSS
files sha256); record deprecation-warning output lines (before-count).

**Verify**: green; fingerprints saved; otherwise STOP.

### Step 1: @import → @use/@forward (+ CSS layers)

Run the Sass module migrator on `bootstrap-needed.scss` (dry-run, review,
apply); convert `app.css` imports to `@use` or plain CSS `@import` with
`layer`. Bootstrap's variable/mixin global-namespace assumptions make this
non-trivial — every namespaced reference must be fixed in the same commit.
Add a `fatalDeprecation: ['import']` (or equivalent for the project's Sass
invocation) check so regressions fail CI instead of warning.

**Verify**: build green; CSS fingerprint byte-identical to baseline;
deprecation lines for the repo's own files gone (Bootstrap-internal ones
remain — record that explicitly).

### Step 2: Anymatch re-evaluation spike (scratch checkout)

On a SCRATCH checkout (never the working tree): replace the `file:` spec
with registry `anymatch@3.1.3`, `npm install --package-lock-only`, compare
resulting picomatch/chokidar/readdirp dedupe + `astro dev`/`build` smoke.
Verdict: KEEP fork (dedupe still wins on Astro 7) / DROP fork (registry
equivalent or better). Either way, update the vendor README's Astro version
reference in the real branch (one-line doc fix, same commit as the verdict
note).

**Verify**: verdict recorded with lockfile-diff evidence.

## Test plan

- Byte-identical CSS fingerprint + full `npm test` + E2E smoke (visual
  safety net for the namespacing rewrite).
- Anymatch: smoke + dedupe comparison (not a unit test).
- Verification: fingerprints, suite, smoke all green.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] Compiled CSS byte-identical to baseline; own-file deprecation warnings gone.
- [ ] `fatalDeprecation` (or equivalent) guard present so `@import` cannot return.
- [ ] Anymatch verdict recorded with evidence; README version reference correct.
- [ ] `npm test` + E2E smoke green.
- [ ] `git diff --name-only 0847089c...HEAD` lists only in-scope files.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report back (do not improvise) if:

- A missed namespace breaks styles silently (fingerprint diff shows
  non-identical CSS you cannot attribute — revert that hunk, do not ship
  visual drift).
- The migrator cannot handle Bootstrap's global-namespace assumptions
  (report; hand-write the namespacing or defer with the warning-count as
  the recorded cost).
- The anymatch spike shows registry is WORSE (keep fork, record numbers —
  that IS the deliverable).
- Any `declared` command fails on the unmodified checkout.

## Maintenance notes

- New stylesheets MUST use `@use` (the CI guard enforces it — that is the
  durable win).
- The fork decision must not be re-audited without a new Astro major — the
  verdict here is the record.
- Reviewer: diff the compiled CSS yourself (fingerprint equality is
  necessary but review the guard + namespacing for intent).
- **Deferred:** Bootstrap 6 (kills both the warnings and possibly the fork
  rationale — re-evaluate then, not now).
