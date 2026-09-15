# Plan 210 (spike): Re-enable the WhatsApp out-of-stock waitlist behind a restock loop

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 0847089c..HEAD -- astro-poc/src/components/ProductCard.astro astro-poc/src/components/ProductCardStrip.astro astro-poc/src/lib/catalog.ts astro-poc/src/scripts/storefront.js test/e2e-astro/notify-when-back.spec.ts docs/operations/RUNBOOK.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S (spike/decision; build follows separately)
- **Risk**: LOW
- **Depends on**: plans/170-land-working-tree-baseline.md
- **Category**: direction
- **Planned at**: commit `0847089c`, 2026-09-14

## Why this matters (product value)

Out-of-stock is the most common lost sale in a grocery shop and today the
only conversion path is a single generic `wa.me` link. Plan 166 designed,
shipped (`ca21c4a6`), then temporarily reverted (`8877eeb6` hide
out-of-stock + `47b6bed9` skip the e2e "until stock:false re-enabled") a
prefilled "Avísame cuando vuelva" message that turns dead AGOTADO cards into
inbound restock demand using the operator's existing WhatsApp inbox — zero
backend. RUNBOOK:283-289 still documents the manual restock flow with no
waitlist. This spike decides re-enablement shape + inbox-volume policy; it
does NOT rebuild the feature blind (the revert was deliberate and may still
be in force).

## Current state (evidence, verified by advisor)

- `plans/archive/166-whatsapp-notify-on-out-of-stock.md:1-37` — shipped
  design ( cheapest conversion win), DONE.
- Revert commits in `git log`: `8877eeb6` ("hide out-of-stock products
  again, temporary, revert plan 166 notify") stripped AGOTADO markup from
  `ProductCard.astro` / `ProductCardStrip.astro` / `lib/catalog.ts`
  (grep today: no AGOTADO markup in those files — confirmed absent).
- `47b6bed9` skips `notify-when-back` e2e until stock:false returns.
- Emitter `storefront.js:1377` (`trackAnalyticsEvent('notify_when_back',
{...})`) still present but inert (no UI triggers it).
- RUNBOOK:283-289 manual restock ritual ("conserva el registro para
  reactivarlo cuando vuelva disponibilidad").

Conventions: storefront-only render change expected; analytics emitter
already exists (reuse, don't re-instrument); E2E lives in
`test/e2e-astro/`; Spanish shopper-facing copy (match plan 166's wording
unless the operator revises it).

## Commands you will need

| Purpose             | Command                                            | Provenance | Expected on success                  |
| ------------------- | -------------------------------------------------- | ---------- | ------------------------------------ |
| Tests               | `npx vitest run test/`                             | declared   | all pass (spike changes nothing yet) |
| E2E (un-skip proof) | `npm run test:e2e` (notify spec only, if feasible) | declared   | documents current skip state         |

## Scope

**In scope**: decision + re-enablement spec: rendering rules, message copy,
emitter reuse, e2e un-skip, inbox-volume thresholds, admin-queue follow-up
home (per plan 166 §Maintenance).

**Out of scope**: building the admin waitlist queue; changing the generic
`wa.me` link; stock-data model changes. No production code changes in the
spike except behind-flag prototypes if needed to answer a question (revert
before finishing).

## Git workflow

- Branch: `advisor/210-waitlist-spike`
- One commit with the decision record (spec section + open questions +
  thresholds). If a throwaway prototype was built, it is reverted before
  the commit (report-only spike).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 0: Confirm the revert is still in force

Verify AGOTADO markup still absent, e2e still skipped, emitter still inert.
Ask the operator (via dispatcher): is the "temporary" hide still desired?
If YES → record "still deferred, re-confirm next quarter" and finish (the
spike's honest outcome). If NO or conditional → proceed.

**Verify**: operator answer recorded; otherwise STOP with the question open.

### Step 1: Specify re-enablement (from plan 166, not from scratch)

Re-read `plans/archive/166-whatsapp-notify-on-out-of-stock.md` fully and
derive: exact render rules (which cards, what copy), the `wa.me` prefilled
message, emitter reuse (`notify_when_back`), e2e un-skip steps, and the
admin sync/queue follow-up home. Update anything plan 166 got wrong against
the CURRENT tree (catalog hiding logic, card components may have moved).

### Step 2: Answer the open questions

- Inbox-volume threshold: how many notifies/day before the operator needs
  the admin queue instead of the inbox? (Propose a number + where it's
  counted — the existing emitter is the counter.)
- Stock:false rendering policy: show AGOTADO cards again everywhere, or
  only where notify is offered? (Single-operator request hid them — the
  operator decides.)
- Copy: keep plan 166's message or revise? (Propose, don't freelance — show
  the exact strings.)

**Verify**: each question has a recommendation + owner decision slot.

## Test plan

- Spike: no new tests. The follow-up build plan (if approved) un-skips the
  e2e and adds render cases per plan 166 §Steps.
- Verification: `npx vitest run test/` green (nothing changed).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] Decision record committed: re-enable spec (render/copy/emitter/e2e) + inbox thresholds + admin-queue follow-up pointer, OR documented
      "still deferred" with re-confirm date.
- [ ] `npx vitest run test/` exits 0 (tree unchanged except the record).
- [ ] `git diff --name-only 0847089c...HEAD` lists at most the decision
      record (+ index row).
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report back (do not improvise) if:

- The operator confirms the hide is permanent (then the outcome is
  "rejected, remove the inert emitter" — file that micro-plan instead).
- Plan 166's design contradicts the current tree beyond reconciliation
  (report the drift; don't redesign WhatsApp commerce here).

## Maintenance notes

- If approved, the build plan's home is the plan-166 §Steps + §Maintenance
  (admin sync/queue as waitlist home) — link both.
- Revisit trigger: stock:false rendering returns for any other reason (then
  this decision re-opens automatically).
- **Deferred:** admin waitlist queue (only when inbox volume hits the
  threshold — evidence-gated, not scheduled).
