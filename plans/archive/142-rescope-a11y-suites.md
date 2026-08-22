# 142 — Re-scope the a11y suites: honest source-contract tests + real keyboard checks

- **Source**: Auditoría 10, TEST-03 · **Status**: TODO · **Priority**: P2 · **Effort**: S
- **Stamped against**: `ee20b0f6` (2026-08-17) · **Drift check**: `git diff --stat ee20b0f6..HEAD -- admin/content-manager/test/browser/keyboardA11y.test.ts admin/content-manager/test/contract/wcagAudit.test.ts admin/content-manager/test/e2e/`

## Problem

The "browser" and "wcagAudit" a11y suites are static source-string scans, not behavioral tests — they pass even if the _rendered_ a11y breaks.

`admin/content-manager/test/browser/keyboardA11y.test.ts:16-97` — every assertion is a string match on TSX source:

```ts
expect(readSource(path)).toContain('role="main"');
```

…under vitest's default node env (no `@vitest-environment browser`, no browser interaction; the unused `@vitest/browser-playwright` devDep confirms intent was browser-level). `admin/content-manager/test/contract/wcagAudit.test.ts:14-25` uses the identical pattern. 40+ assertions inflate the green count: removing `role="alert"` from a _rendered branch_ (while it remains elsewhere in the file) passes CI.

## Scope

**In**: `admin/content-manager/test/browser/keyboardA11y.test.ts`, `admin/content-manager/test/contract/wcagAudit.test.ts` (rename/move + honest framing), `admin/content-manager/test/e2e/` (only if real keyboard assertions are missing there), `admin/content-manager/package.json` (drop the unused `@vitest/browser-playwright` devDep only if confirmed unused).

**Out**: The components themselves, the existing e2e specs' keyboard coverage (do not duplicate — reuse).

## Steps

1. Rename/move the two suites to an explicit contract folder with an honest name (e.g. `test/web/sourceContract/` or `test/contract/a11ySourceContract.test.ts`) and update their `describe` blocks to say "source contract — string-level, not behavioral". Keep the assertions (they still guard against wholesale attribute removal) but stop the false framing.
2. Audit the existing Playwright specs (`test/e2e/operator.spec.ts`, `scope.spec.ts`, `import-export.spec.ts`) for real keyboard coverage: skip-link focus, dialog focus trap, ESC-dismiss, `role="alert"` on rendered error branches. For any gap, add the assertion to the most relevant spec (the repo's Playwright base config in `admin/content-manager/playwright.base.ts` is the pattern).
3. Remove `@vitest/browser-playwright` from `admin/content-manager/package.json` only if no test imports it (grep first); if it stays, leave the manifest alone.

## Tests

The re-scoped suites must still pass unchanged (assertions kept); the new e2e assertions are the real behavioral coverage. Run: `npm run admin:test` green; then the admin e2e for the touched spec: `npm run admin:test:e2e` (uses the temp-repo servers — see `admin/content-manager/package.json` scripts).

## Done criteria

- [ ] No suite named "keyboard/browser a11y" performs only source-string scans (renamed/moved).
- [ ] At least one real rendered-keyboard assertion added (focus trap or ESC-dismiss or skip link) where the audit found the gap.
- [ ] `npm run admin:test` green; touched e2e spec green.

## Maintenance

The WCAG/a11y posture of this repo deserves a real scan layer eventually (see the dead `.pa11yci.json`, plan 161); this plan's job is only to stop the false coverage. When a real layer lands, the source-contract suite can be deleted.

## Rollback

`git revert <sha>`.

## STOP conditions

- If a real keyboard e2e assertion ALREADY exists for every gap (audit was wrong), skip step 2 and report — renaming alone then suffices.
