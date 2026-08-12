# 126 — Assert destructive-confirm dialogs in admin e2e (contract, not swallow)

- **Source**: Auditoría 9, TEST-03
- **Status**: TODO · **Priority**: P3 · **Effort**: S
- **Stamped against**: `b3805e1`

## Problem

The destructive-confirm gate (plan 091, `window.confirm` on delete/archive/
purge/bulk) is a contract nobody tests. Every admin spec handles dialogs
reactively and silently:

- `scope.spec.ts:53` — `page.once('dialog', (dialog) => dialog.accept())`,
- `scope.spec.ts:83` — dismiss, with the comment "the page-level confirm is
  skipped",
- `storefront.spec.ts:56` — accept (added in `ccb921f` after the drift
  incident: plan 091's confirm broke the spec, and the fix was to swallow
  the dialog).

A `page.once('dialog')` handler that never fires passes without error, so
removing the confirm would not fail any test. The drift already happened
once this week; a future UI change (dialog → inline confirm, custom modal,
timing change) silently invalidates the suite again.

## Scope

**In**: `admin/content-manager/test/e2e/scope.spec.ts`, `storefront.spec.ts`
(the destructive flows: purge, delete, archive, bulk apply, delete bundle).

**Out**: app code.

## Steps

1. Replace the silent handlers on destructive actions with **asserting**
   handlers:
   ```ts
   const dialogPromise = page.waitForEvent('dialog');
   await page.getByRole('button', { name: 'Eliminar combo 1' }).click();
   const dialog = await dialogPromise;
   expect(dialog.type()).toBe('confirm');
   expect(dialog.message()).toMatch(/Eliminar/);
   await dialog.accept();
   ```
2. Do this for each destructive action the specs exercise: scope.spec purge
   (:221), the confirm-cancel path (:83 — assert the message then dismiss),
   storefront.spec delete bundle (:56), and any archive/bulk flows that use
   confirms (grep the specs for `once('dialog')`).
3. If a spec needs a handler on a NON-destructive page (the credential
   modal is a DOM dialog, not a native one — it doesn't need this), leave it
   as-is.
4. Do not change app behavior; if any flow turns out to NOT fire a confirm
   where the test now expects one, that is a real drift — stop and report
   (per the escape hatch below) rather than reverting the assertion.

## Tests

- The updated specs ARE the deliverable; run the scope + storefront e2e
  configs green.
- Mutation coverage: each destructive flow has exactly one expected confirm
  (the `waitForEvent` makes double-confirm paths explicit).

## Done criteria

- [ ] Every `once('dialog')` in destructive specs is replaced with an
      asserting pattern (grep `once('dialog')` — only non-destructive or
      documented uses remain).
- [ ] Removing a confirm from the app would now fail a test (verified by
      the pattern, not by actually removing one).
- [ ] Scope + storefront e2e configs green.

## Maintenance

This closes the loop on the `ccb921f` incident: dialogs are now part of the
contract the suite asserts, so app/test drift on destructive UX fails CI
instead of being patched by swallowing.

## Rollback

N/A (tests only).
