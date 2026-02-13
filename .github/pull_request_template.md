# PR Checklist

## Scope
- [ ] Scope is small and reversible
- [ ] No unrelated refactors
- [ ] No breaking change introduced without migration plan

## Risk Level
- [ ] Routine
- [ ] Risky (SW / checkout / images / critical CSS / routing / schema)

## Required Verification
- [ ] `npm run lint`
- [ ] `npm test`
- [ ] `npm run build`
- [ ] `npm run test:e2e` (required when routes/UI/cart/SW/checkout are affected)
- [ ] Manual smoke checklist (`npm run smoke:manual`)

## Contract and Migration
- [ ] Public contracts unchanged (URLs, slugs, schema/API shape)
- [ ] If changed, migration plan documented
- [ ] If changed, rollback path documented

## Rollback Plan (Required if Risky)
- Plan:
- Revert commit SHA:
- Validation commands after revert:

## Evidence
- Command outputs (lint/test/build/e2e):
- Smoke test notes:
- Lighthouse report link (if perf-related):
- Screenshots (if visual changes):
