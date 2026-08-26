# 160 — Guard the vendored anymatch fork against dir↔tarball drift

- **Source**: Auditoría 10, DEP-02 · **Status**: DONE · **Priority**: P3 · **Effort**: M
- **Stamped against**: `ee20b0f6` (2026-08-17) · **Drift check**: `git diff --stat ee20b0f6..HEAD -- astro-poc/vendor/anymatch/ tools/check-determinism-paths.mjs package.json`

## Problem

The lockfile installs the vendored tarball, but git also tracks the readable working copy — and nothing guards the two against drift.

- `package-lock.json:7050` resolves `node_modules/anymatch` to `file:astro-poc/vendor/anymatch/anymatch-3.1.3.tgz`.
- Git tracks BOTH the tgz and `astro-poc/vendor/anymatch/{index.js,index.d.ts,package.json,README.md,LICENSE}`. The two copies have ALREADY drifted: the dir's `package.json` description differs from the tgz's, and the dir carries extra files (`LICENSE`, `README.md`) the tgz's `files` list excludes.
- `tools/check-determinism-paths.mjs` scans for absolute paths only — no check that the tgz equals the source dir.

An editor will naturally patch the readable `index.js` (the fork replaces an upstream frozen since 2022), forget to re-pack the tgz, and every `npm ci` in CI and locally keeps installing the stale tarball — silently, because the fork lives outside the registry.

## Scope

**In**: A new check (extend `tools/check-determinism-paths.mjs` or add `tools/check-vendor-tgz.mjs`) wired into `npm run check:determinism` (and preflight if cheap), plus a README note in the vendor dir documenting re-pack as the only edit path.

**Out**: The vendored package contents themselves (the fork's functionality), the lockfile resolution.

## Steps

1. Write the check: read `astro-poc/vendor/anymatch/package.json` `files` list (or a fixed set: `index.js`, `index.d.ts`, `package.json`), pack those files into an in-memory tgz (using `tar` via `npm pack` semantics or a pure-JS tar write — prefer the simplest dependency-free approach: `npm pack` into a temp dir and diff, or `node:zlib`+tar-free concat is NOT valid — use the npm-pack approach), and byte-compare against the committed `anymatch-3.1.3.tgz`. Fail on any diff.
2. Wire it into `npm run check:determinism` (package.json) and add a one-line note in `astro-poc/vendor/anymatch/README.md`: "edit index.js, then re-pack: `npm pack` (from the dir) and replace the tgz in the same commit".
3. Run it: the check passes TODAY only after either (a) re-packing the current dir into a fresh tgz (metadata-only drift — the functional code is identical per the audit), or (b) explicitly deciding the extra files (LICENSE/README) are intended and excluding them from the comparison with a comment.

## Tests

- The check itself: a temp repo where the dir and tgz differ → check fails; where they match → passes. Add it under `test/` (pattern: `test/check-determinism-paths`-style test or a direct assertion in a new `test/vendor-tgz.guard.test.js`).
- Run: `npm run check:determinism` green; `npm run lint` green.

## Done criteria

- [ ] The tgz↔dir check runs as part of `check:determinism` and passes.
- [ ] A deliberately-mutated dir copy fails the check (asserted in the test).
- [ ] `npm run check:determinism` green.

## Maintenance

This closes the last unguarded vendored dependency in the repo. If the fork ever needs a real upstream sync (upstream unfreezes), the check still applies — re-pack is mandatory for any edit. A reviewer should confirm the re-pack commit (step 3) contains ONLY the intended metadata/extra-file decision.

## Rollback

`git revert <sha>` (re-pack is reversible via git history of the tgz).

## STOP conditions

- If `npm pack` of the dir produces a tgz whose compression differs byte-wise from the committed one for the same content, stop and report — the check must compare extracted contents, not raw tgz bytes.
