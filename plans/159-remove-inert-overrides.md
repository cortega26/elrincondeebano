# 159 — Remove the inert astro-poc `overrides` block

- **Source**: Auditoría 10, DEP-01 · **Status**: TODO · **Priority**: P3 · **Effort**: S
- **Stamped against**: `ee20b0f6` (2026-08-17) · **Drift check**: `git diff --stat ee20b0f6..HEAD -- astro-poc/package.json package-lock.json`

## Problem

`astro-poc/package.json:25-28` declares an `overrides` block that npm never enforces — workspace-level `overrides` are ignored; npm only honors them at the root. The installed tree resolved `picomatch@4.0.5` (`package-lock.json:11410`) while the block pins `4.0.4`, and the lockfile's astro-poc mirror entry (`package-lock.json:163-173`) records no overrides.

```jsonc
// astro-poc/package.json:25-28
"overrides": {
  "picomatch": "4.0.4",
  "anymatch": "$anymatch"
}
```

The `"anymatch": "$anymatch"` self-reference is equally inert. The vendored anymatch (`astro-poc/vendor/anymatch/`) already self-declares `picomatch ^4.0.4` in its package.json, which `4.0.5` satisfies — so removing the block changes nothing functionally; it only removes the false sense of a pin.

## Scope

**In**: `astro-poc/package.json` (delete the `overrides` block), `package-lock.json` (reconcile if needed).

**Out**: `astro-poc/vendor/anymatch/` (plan 160's scope), the root manifest.

## Steps

1. Delete the `overrides` key from `astro-poc/package.json`.
2. Run `npm install --package-lock-only` to reconcile the lock (read-only against the tree; regenerates the lockfile). If that produces no lockfile change (the block was already inert), no commit of the lock is needed.
3. Verify: `npm ls picomatch anymatch` resolves the same tree as before (picomatch 4.0.5, vendored anymatch) and reports no invalid/missing.

## Tests

- `npm ci` in a temp dir or `npm ls` → exit 0, same tree.
- `npm run build:fast` or at minimum `npm run typecheck:astro` green (the vendored closure still loads).
- `npm run lint` green.

## Done criteria

- [ ] `astro-poc/package.json` has no `overrides` key.
- [ ] `npm ls picomatch anymatch` → same resolved versions, exit 0.
- [ ] `npm run typecheck:astro` green.

## Maintenance

If a picomatch pin is EVER genuinely wanted, it belongs in the root `package.json` `overrides` (npm's only honored location) with a lockfile regeneration. Plan 160 adds the vendored-anymatch drift guard that makes the closure's integrity verifiable.

## Rollback

`git revert <sha>`.

## STOP conditions

- If `npm install --package-lock-only` churns unrelated lockfile sections, revert it and commit only the manifest change (or stop and report — a lockfile churn is a drift signal).
