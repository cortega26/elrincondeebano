# Plan 085: Add a degraded mode to parking reservations when external data sources fail

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 30dbab7..HEAD -- astro-poc/src`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: correctness
- **Planned at**: commit `30dbab7`, 2026-08-03

## Why this matters

The parking reservation page — a paid, time-sensitive WhatsApp booking flow —
hard-fails whenever either external data source fails: `Promise.all([
fetchHolidays(), fetchBookings() ])` rejects on any failure
(`parking-reservation.js:517-526`), sets `dataLoadFailed = true`, and the
submit handler then refuses to open WhatsApp (`:551-565`). The holidays
endpoint (`https://feriados.cl/api/v1/feriados`) was unreachable (404) at
audit time, and the bookings CSV is another external dependency — so the
page's core function is a no-op whenever the internet or a third party
blinks. There is no degraded mode.

Related: the holiday parser assumes the response is a bare array
(`parking-reservation.js:59-65`); if feriados.cl returns its documented
`{ data: [...] }` envelope, holiday nights silently price at the regular
rate (a money bug that shows no error).

After this plan: the page books with a visible "disponibilidad sin
verificar" warning when external data is unavailable, and the envelope
shape is handled either way.

## Current state

Verified code (read directly):

- `astro-poc/src/scripts/parking-reservation.js:517-526`:
  ```js
  Promise.all([fetchHolidays(), fetchBookings()])
    .then(function () { ... })
    .catch(function () { dataLoadFailed = true; ... });
  ```
- `:551-565` — the submit handler refuses when `dataLoadFailed`:
  shows "No se pudo verificar disponibilidad."
- `:59-65`:
  ```js
  var dates = (Array.isArray(data) ? data : []).map(function (item) { ... });
  ```
- `:139-152` — `getNightPrice`: holiday/eve nights = CLP 5.000, regular =
  CLP 4.000 (pricing affected by the envelope bug).
- The page loads `parking-reservation.js` via the storefront script setup
  (BaseLayout) — plain JS, no build step needed beyond the existing one.
- Tests exist: `test/parking-reservation.spec.js` (node:test) — extend it.

## Commands you will need

| Purpose    | Command                                        | Expected on success          |
| ---------- | ---------------------------------------------- | ---------------------------- |
| Root tests | `npm test`                                     | exit 0                       |
| Targeted   | `node --test test/parking-reservation.spec.js` | all pass                     |
| Build      | `npm run build:fast`                           | exit 0 (verifies the bundle) |

## Scope

**In scope**:

- `astro-poc/src/scripts/parking-reservation.js`
- `test/parking-reservation.spec.js`

**Out of scope**:

- Replacing the feriados.cl dependency with a bundled holiday table (a
  bigger decision — note it in maintenance).
- Changing the WhatsApp flow, prices, or the booking UI structure.
- The content manager or Python fallback.

## Git workflow

- Branch: `advisor/085-add-parking-degraded-mode`.
- Single commit: `fix(storefront): parking books with warning when external availability data is down` + `Co-Authored-By: Claude <noreply@anthropic.com>`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Make the data fetches fail soft

Change the load path so failures resolve to empty state instead of
rejecting:

```js
function fetchHolidaysSafe() {
  return fetchHolidays().catch(function () {
    return { unavailable: true, dates: [] };
  });
}
function fetchBookingsSafe() {
  return fetchBookings().catch(function () {
    return { unavailable: true, bookings: [] };
  });
}
Promise.all([fetchHolidaysSafe(), fetchBookingsSafe()]).then(function (results) {
  // keep the existing availability computation when data present
  // set a flag: availabilityDataMissing = results.some(r => r.unavailable)
});
```

Keep `dataLoadFailed` semantics only for the case where data was fetched
but the availability check found everything taken (verify what the existing
flag means in the availability logic before renaming — read `:517-550` and
the submit handler fully first; if `dataLoadFailed` doubles for "no
availability at all", split the two meanings).

**Verify**: `node --test test/parking-reservation.spec.js` — existing tests
pass (they may stub the fetches; adjust stubs to the new safe wrappers
without changing their assertions).

### Step 2: Degraded submit behavior

When availability data is missing, the submit handler should NOT refuse:
open WhatsApp with a confirmation step that includes an explicit warning —
"disponibilidad no verificada" — appended to the WhatsApp message (or shown
in the pre-open dialog, whichever the existing flow supports — read the
submit handler before choosing). Keep the current refusal ONLY for the
"everything taken" case.

**Verify**: extend `test/parking-reservation.spec.js` with: fetch failure →
submit still opens WhatsApp (stub `window.open` / the wa.me URL builder) and
the message contains the warning; fetch success + no availability → still
refuses.

### Step 3: Handle the envelope shape

In the holidays parser, accept both shapes:

```js
var payload = Array.isArray(data) ? data : data && Array.isArray(data.data) ? data.data : [];
```

Add a unit test asserting the `{ data: [...] }` shape produces holiday
dates (priced at 5.000 via `getNightPrice`).

**Verify**: `node --test test/parking-reservation.spec.js` — all pass,
including the two new cases; `npm test` exit 0.

### Step 4: Bundle verification

**Verify**: `npm run build:fast` exit 0 (the modified script bundles cleanly).

## Test plan

- `test/parking-reservation.spec.js` (extend; follow its existing stub
  patterns):
  1. holidays+bookings fetch fail → submit proceeds with warning in message
  2. data present + everything taken → still refuses
  3. `{ data: [...] }` envelope → holiday pricing applied
  4. bare-array response (current shape) → unchanged behavior
- `npm test` full suite exit 0 (watch for cross-file effects — the parking
  spec is node:test; the storefront spec files are vitest; both must pass).

## Done criteria

- [ ] Fetch failures no longer block submission (test 1 proves it)
- [ ] "Everything taken" still blocks (test 2 proves it)
- [ ] Both envelope shapes parse (tests 3-4 prove it)
- [ ] `node --test test/parking-reservation.spec.js`, `npm test`,
      `npm run build:fast` exit 0
- [ ] `plans/README.md` status row 085 updated

## STOP conditions

Stop and report back (do not improvise) if:

- The submit handler's structure doesn't have a place to append the warning
  without restructuring the flow (report the structure you found; a
  minimal change is in scope, a flow redesign is not).
- The availability logic uses `dataLoadFailed` in ways that make the
  two-meaning split ambiguous — report what you find before renaming.

## Maintenance notes

- The feriados.cl dependency remains fragile (404 at audit time). A bundled
  static holiday table for the current year is the durable fix — worth its
  own decision/plan; this plan only removes the hard-fail.
- The warning message must be bilingual (site convention — the UI strings
  are Spanish with English variants; check how other strings switch).
- Reviewer focus: the WhatsApp message change — the confirmation text is a
  customer-facing artifact; keep it truthful ("disponibilidad no
  verificada") and in the same style as existing messages.
