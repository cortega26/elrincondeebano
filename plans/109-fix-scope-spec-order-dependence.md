# 109 — Make scope.spec.ts order-independent (fixture coupling)

- **Source**: Auditoría 9, T5 (TEST-05)
- **Status**: TODO · **Priority**: P2 · **Effort**: S
- **Stamped against**: `ccb921f`

## Problem

`admin/content-manager/test/e2e/scope.spec.ts` has order-dependent tests:

```ts
// scope.spec.ts:281-283 — the bulk-selection test asserts a count that
// only holds because the purge test (:221 "Eliminar definitivamente
// Producto C 1") deleted a fixture product earlier in the same file:
// "cat-c has 9 products: the purge test removed C 1 earlier in the file"
await expect(...).toHaveText('Mostrando 1–9 de 9');
```

Playwright's default serial in-file execution makes it pass; `--shard`,
parallel workers, or reordering breaks it — exactly the flakiness class the
repo just experienced (e2e broken by app drift, fixed reactively in
`ccb921f`).

## Scope

**In**: `admin/content-manager/test/e2e/scope.spec.ts` (the bulk-selection
test around :281 and any other count assertions that depend on earlier
mutations — grep the file for comments referencing earlier tests).

**Out**: app code.

## Steps

1. Find every assertion whose expected value depends on a mutation from an
   earlier test (grep for "earlier in the file" comments and hardcoded
   counts).
2. For each: derive the expected count from the API instead of hardcoding —
   `const res = await page.request.get('/api/v1/products?category=cat-c');`
   and assert the UI shows the API's total (the server is the source of
   truth; the UI test should verify the UI reflects it, not encode fixture
   arithmetic).
3. If a dependency is unavoidable (a test genuinely needs a prior mutation),
   declare it explicitly: `test.describe.configure({ mode: 'serial' })` for
   that group with a comment explaining the coupling, and keep the count
   derivation API-based anyway.
4. Sanity check the whole file for other implicit couplings (the purge test
   at :221 itself — does any later test assert the pre-purge count?).

## Tests

- Run the scope config twice, including with
  `--workers=2` and with the two tests reordered (temporarily) — green
  either way.
- `npm run admin:test` + scope e2e green.

## Done criteria

- [ ] No hardcoded count in scope.spec.ts depends on a mutation from another
      test (grep the file).
- [ ] `npx playwright test -c playwright.scope.config.ts --workers=2` green
      on a fresh fixture.
- [ ] Full scope suite green.

## Maintenance

CI does not shard today, but this is a one-flag step away; the repo has
already suffered one drift/flake incident this week. Keep the "API-derived
expectations" rule in e2e specs.

## Rollback

N/A (tests only).
