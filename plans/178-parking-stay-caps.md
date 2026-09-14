# Plan 178: Cap parking stays and fix the min>max checkout dead end

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 0847089c..HEAD -- astro-poc/src/scripts/parking-reservation.js test/parking-reservation-timeout.spec.js`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/170-land-working-tree-baseline.md
- **Category**: bug
- **Planned at**: commit `0847089c`, 2026-09-14

## Why this matters

The parking widget declares `MAX_NIGHTS = 30` for the date-picker window but
never enforces it at submit: a far-future checkout (typed, pasted, or set
past the picker cap via devtools) makes `calculateBreakdown` loop per night
with `toLocaleDateString` + a DOM row each — thousands of rows and a huge
WhatsApp message (tab jank/hang). `getDateFromInput` ignores the inputs'
`min`/`max` entirely. And when check-in lands on the last allowed day,
`checkout.min` is pushed past `checkout.max`, leaving no selectable checkout
until check-in moves back. All validation-only, all covered by the existing
fake-timer test pattern.

## Current state

Relevant files:

- `astro-poc/src/scripts/parking-reservation.js` — `getDateFromInput`
  (lines 322–327), `onSubmit` (lines 531–541), `calculateBreakdown`
  (lines 241–275), init min/max (lines 588–597), check-in change handler
  (lines 645–657).
- `test/parking-reservation-timeout.spec.js` — untracked working-tree test
  using `vi.useFakeTimers` + `advanceTimersByTimeAsync` (landed by plan 170;
  extend it).

Excerpts (verified by advisor read):

```js
// getDateFromInput ignores min/max/validity
function getDateFromInput(id) {
  var el = document.getElementById(id);
  if (!el || !el.value) return null;
  var d = new Date(el.value + 'T12:00:00');
  return isNaN(d.getTime()) ? null : d;
}
```

```js
// onSubmit checks only ordering — no duration cap
if (!checkIn || !checkOut || checkOut <= checkIn) { ...; return; }
var breakdown = calculateBreakdown(checkIn, checkOut, holidays, bookings);
```

```js
// init fixes max at load; check-in handler advances checkout.min past max
checkin.max = maxStr;
checkout.max = maxStr; // fixed at init
checkout.min = dateToISO(dayAfter); // can exceed checkout.max
```

Conventions: vanilla JS (`var`, function decls) in this file — match it, do
not modernize. User feedback via existing `setStatusMessage(msg, level)` +
warning UI. Tests: root vitest (`test/*.spec.js`), fake-timer pattern in
the parking timeout spec.

## Commands you will need

| Purpose | Command                                                                                    | Provenance | Expected on success |
| ------- | ------------------------------------------------------------------------------------------ | ---------- | ------------------- |
| Install | `npm ci`                                                                                   | declared   | exit 0              |
| Tests   | `npx vitest run test/parking-reservation.spec.js test/parking-reservation-timeout.spec.js` | declared   | all pass            |

## Scope

**In scope**:

- `astro-poc/src/scripts/parking-reservation.js` (validation only)
- `test/parking-reservation-timeout.spec.js` (extend; landed by plan 170 —
  if plan 170 reverted the tree, create the tests fresh in this file)

**Out of scope**:

- Pricing/quote math, holiday/booking lookup, WhatsApp message shape.
- `MAX_NIGHTS` value change (keep 30; enforce it).
- Any admin-side parking code.

## Git workflow

- Branch: `advisor/178-parking-stay-caps`
- Commit per step; e.g. `fix(storefront): cap parking stays at MAX_NIGHTS; fix checkout dead end (plan 178)`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 0: Establish a green baseline

Requires plan 170 DONE. Confirm the parking specs pass unmodified.

**Verify**: vitest on both parking spec files → pass; otherwise STOP.

### Step 1: Enforce range + duration in submit/change paths

- In `getDateFromInput` (or its callers `onSubmit`/`onDateChange`): reject
  inputs failing native validity (`el.validity.rangeOverflow/rangeUnderflow`
  — i.e. outside the picker's min/max) with the existing warning UI, same
  as the ordering message.
- In `onSubmit` (and `onDateChange` if it renders breakdowns): compute
  nights = (checkOut − checkIn)/day; if nights > `MAX_NIGHTS` (30), show
  the warning message and return without rendering/sending.
- When check-in advances such that `checkout.min > checkout.max`, extend
  `checkout.max` to stay ≥ `checkout.min` (or clamp check-in to max−1 day —
  pick the smaller change that keeps a selectable checkout; document the
  choice in the commit).

**Verify**: targeted vitest files pass.

### Step 2: Extend the timeout spec with cap cases

Add to `test/parking-reservation-timeout.spec.js` (fake timers + DOM
fixture pattern already there):

1. 31-night stay → warning, no breakdown rows, no WhatsApp message built.
2. Exactly-30-night stay → renders (boundary).
3. Checkout typed past `max` → rejected via validity path.
4. Check-in on last allowed day → checkout still selectable (min ≤ max).

**Verify**: full parking specs pass; `npx vitest run test/` stays green.

## Test plan

- 4 new cases in the parking timeout spec (fake timers, DOM fixture).
- Existing parking specs unchanged and green.
- Verification: `npx vitest run test/parking-reservation.spec.js test/parking-reservation-timeout.spec.js`.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] New cap cases pass; whole `test/` suite green.
- [ ] `grep -n "MAX_NIGHTS" astro-poc/src/scripts/parking-reservation.js` shows use in submit/change validation (not only init).
- [ ] No stay longer than 30 nights can reach `calculateBreakdown` from UI paths (assert by code reading + test 1).
- [ ] `git diff --name-only 0847089c...HEAD` lists only in-scope files.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report back (do not improvise) if:

- The file does not match excerpts (drift — plan 170's landing may have
  refactored it).
- `onDateChange` renders through a different path than `onSubmit` and
  cannot share the guard locally.
- `MAX_NIGHTS` is not 30 or is user-configurable (then the cap value needs
  an owner decision — report).

## Maintenance notes

- If the operator ever raises `MAX_NIGHTS`, the WhatsApp message length
  grows with nights — flag that coupling in review.
- Reviewer: confirm typed/pasted dates (bypassing the picker) are covered
  by the validity check, not just picker-selected dates.
- **Deferred:** none.
