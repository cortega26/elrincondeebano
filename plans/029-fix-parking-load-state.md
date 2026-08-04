# Plan 029: Make parking availability failure reachable and explicit

> **Executor instructions**: Follow the plan and update `plans/README.md` after completion.
>
> **Drift check (run first)**: `git diff --stat 877f179..HEAD -- astro-poc/src/scripts/parking-reservation.js test/parking-reservation.spec.js`

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `877f179`, 2026-07-14

## Why this matters

After either availability API fails, `dataLoadFailed` becomes true while `dataReady` remains false. Submit checks `!dataReady` first, so users see “Cargando” forever and the actionable failure branch is unreachable. A single explicit state prevents this impossible combination and regression.

## Current state

`parking-reservation.js:512-526` uses two booleans. `parking-reservation.js:551-563` checks loading before failure. Existing DOM/API tests are in `test/parking-reservation.spec.js`; match their fetch stubs and selectors.

## Commands you will need

| Purpose | Command                                                          | Expected |
| ------- | ---------------------------------------------------------------- | -------- |
| Focused | `npx vitest run test/parking-reservation.spec.js`                | all pass |
| Gate    | `npm run lint && npm run typecheck && npm test && npm run build` | exit 0   |

## Scope

**In scope**: two drift-check files. **Out of scope**: API providers, cache TTL, reservation holds, pricing rules, UI redesign.

## Git workflow

- Branch: `advisor/029-fix-parking-load-state`
- Commit: `fix: surface parking availability failures`

## Steps

### Step 1: Replace boolean combinations with one state

Use `let dataState = 'loading'`, set `ready` only after both promises resolve, and set `failed` in catch. Submit must handle `failed`, then `loading`, then call `onSubmit`. Date-change logic must run only for `ready`.

**Verify**: add tests for one API rejecting, both pending and both resolving. Failure must show the existing danger message and never open WhatsApp.

### Step 2: Run the full gate

**Verify**: full gate command → exit 0.

## Test plan

Cover rejection of holidays and bookings independently, loading before settlement, successful ready path, and no unhandled rejection.

## Done criteria

- [ ] Failure message is reachable after either API rejects.
- [ ] Loading message appears only while requests are pending.
- [ ] WhatsApp cannot open unless availability is ready and valid.
- [ ] Focused/full gates pass.

## STOP conditions

- Existing behavior intentionally allows booking when an availability provider fails.
- Test setup cannot deterministically control the two promises.

## Maintenance notes

Keep availability as a state machine if retry/cached-stale states are added later; do not reintroduce independent booleans.
