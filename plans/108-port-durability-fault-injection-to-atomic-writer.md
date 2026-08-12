# 108 — Port the fault-injection durability suite to AtomicWriter

- **Source**: Auditoría 9, T4 (TEST-04)
- **Status**: TODO · **Priority**: P2 · **Effort**: M
- **Stamped against**: `ccb921f`

## Problem

Plan 030's deep durability investment guards **dead code**. The two-file
commit protocol + 10 fault-injection tests live in
`server/productStore.js` / `test/product-store.durability.test.js` — a
module referenced by nothing live (`package.json` has no reference;
`astro-poc/` never imports it; only `server/httpServer.js` — itself
unreferenced — and test bootstraps use it).

The live write path is `admin/content-manager/src/server/services/atomicWriter.ts:33-54`
(tmp → verify → backup → rename), whose interruption coverage is:

- `test/contract/atomicWriter.test.ts` — 3 tests, rename-failure only;
- one route-level scenario in `test/integration/failureInjection.test.ts:239`.

The canonical commit protocol's crash windows (tmp write, backup rename,
install rename, split-revision recovery) are exercised by exactly one
scenario on the live module.

## Scope

**In**: `admin/content-manager/test/contract/atomicWriter.test.ts` (port the
parametrized interruption suite), `atomicWriter.ts` **only if** the port
reveals it needs an injectable fs seam (prefer adding the seam to the test
harness over changing production code).

**Out**: `server/productStore.js`, `server/httpServer.js`, the legacy
`test/product-store.durability.test.js` (deletion of the legacy server is
plan 111 — depends on this plan landing first).

## Steps

1. Read `test/product-store.durability.test.js` (the parametrized
   interruption test at ~:116 and the "no direct target writeFile" guard at
   ~:263) and `plans/archive/030-make-product-store-durable.md:89-91` for
   the protocol boundaries.
2. Port the interruption-boundary parametrization to AtomicWriter: inject a
   failing-fs adapter (wrap `node:fs` calls — `writeFile`/`rename`/`copyFile`
   — with a failure schedule: fail on N-th call), and assert for each crash
   window: (a) no partial/corrupt target file survives; (b) a backup exists
   or the previous version is intact; (c) recovery on next write converges
   to the new version.
3. Mirror the "no direct target write" guard: assert the AtomicWriter path
   never writes the target path directly (only via tmp + rename), with a
   test that spies on `fs.writeFile` calls.
4. Do not change production behavior; if the seam requires a minimal change
   (e.g. optional injected fs in the constructor), keep it additive and
   default to real fs.

## Tests

- The ported suite: run `npm run admin:test` green.
- Report the scenario count delta (from 3+1 to the ported N) in the PR/commit.

## Done criteria

- [ ] Every crash window in the plan-030 protocol has a corresponding
      AtomicWriter test (tmp write, backup rename, install rename,
      split-revision recovery).
- [ ] No-direct-write guard test exists for the live path.
- [ ] `npm run admin:test` green; legacy suite untouched (still green until
      plan 111 deletes it).

## Maintenance

This unblocks plan 111 (retire the legacy `server/` module + its tests).
The durability contract for the repo's write path now lives where the code
lives — future changes to `atomicWriter.ts` must keep these tests green.

## Rollback

N/A (tests + additive seam only).
