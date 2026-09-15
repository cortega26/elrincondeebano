# Plan 191: Decide release-gate vs baseline stage ownership (selectors, plans)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 0847089c..HEAD -- tools/validate-release.mjs package.json docs/operations/VALIDATION_MATRIX.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/170-land-working-tree-baseline.md
- **Category**: tests
- **Planned at**: commit `0847089c`, 2026-09-14

## Why this matters

`npm run validate` (local baseline) runs `check:e2e-selectors` and
`check:plans`, but `npm run validate:release` (the ship gate) runs neither —
and never invokes `admin:contract`/`admin:certify`. Crucially,
`VALIDATION_MATRIX.md` documents this split as _intentional_ ("the release
runner currently defines its stages independently rather than invoking
`npm run validate`"). So this is NOT an obvious defect to "fix" by adding
stages (that lengthens release runs and may duplicate ownership) — it is an
owner decision with two consistent outcomes. This plan forces the decision
and implements whichever is chosen, keeping docs and code in agreement.

## Current state

Verified by advisor read:

```js
// tools/validate-release.mjs:3-37 — stages (no check:e2e-selectors, no check:plans)
lint → typecheck → build → test → guardrails:assets → test:e2e → monitor:share-preview
```

```json
// package.json:78 — validate DOES include them
"validate": "npm run lint && npm run typecheck && npm run check:e2e-selectors && npm run build && npm test && npm run check:plans && npm run guardrails:assets"
```

```md
<!-- docs/operations/VALIDATION_MATRIX.md — intentional split, documented -->

- The local baseline owns `check:e2e-selectors`; the release runner currently
  defines its stages independently rather than invoking `npm run validate`.
- If the release gate needs to change, update this file, `package.json`, and the
  ADR index together.
```

Note the failure modes each direction leaves open: release-without-selectors
can ship silently-broken E2E class hooks; release-without-plans can ship a
DONE plan outside `archive/`; validate-without-E2E means no single command
exercises the full gate today.

## Commands you will need

| Purpose   | Command                                                                                                                                    | Provenance | Expected on success |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------- | ------------------- |
| Selectors | `npm run check:e2e-selectors`                                                                                                              | declared   | exit 0              |
| Plans     | `npm run check:plans` (`node tools/check-plan-archive.mjs`)                                                                                | declared   | prints OK           |
| Release   | `node tools/validate-release.mjs` (only to observe; full run is slow/networked — do NOT run to completion unless the decision requires it) | declared   | —                   |

## Scope

**In scope**: the decision + whichever implementation follows + doc updates
(`VALIDATION_MATRIX.md`, ADR 0007 if stage order/content changes, this plan's
index row).

**Out of scope**: adding `admin:contract`/`admin:certify` to either gate
(separate owner decision — mention, do not implement); changing what the
stages check (only where they run).

## Git workflow

- Branch: `advisor/191-release-gate-ownership`
- Single commit; e.g. `chore(gates): release runner owns selectors+plans checks (plan 191)`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 0: Confirm the current behavior (no changes)

Run `npm run check:e2e-selectors` and `node tools/check-plan-archive.mjs`
on the clean tree. Read `tools/validate-release.mjs` fully and confirm the
stage list matches Current state.

**Verify**: both checks pass; stage list confirmed; otherwise STOP (a red
baseline is a different problem — report it).

### Step 1: Get the owner decision (do not skip)

Ask the operator (via the dispatcher/reviewer — do not guess): should
`validate:release` (a) ADD `check:e2e-selectors` + `check:plans` stages, or
(b) keep the split with the local baseline owning them? Present the failure
modes above. Default recommendation: (a) — the ship gate should be a
superset of the local baseline; the added cost is seconds (both checks are
static, not builds).

If no operator is reachable in this session: implement (a) behind the
recommendation, clearly marked as reversible, and note in the commit that it
awaits owner confirmation (the change is additive and fail-closed, so this
is safe).

**Verify**: decision recorded in the commit message.

### Step 2: Implement the decision

- If (a): add both stages to `tools/validate-release.mjs` in the same
  position philosophy as `validate` (selectors before build, plans after
  test — match `validate`'s order), reusing the same stage-runner shape.
- If (b): strengthen the documentation instead — `VALIDATION_MATRIX.md` +
  the release script's header comment must state exactly which gate owns
  which check and why, so the next audit does not re-report this.
- Either way, update `VALIDATION_MATRIX.md` if its wording is now stale
  (it names the file/package/ADR triple to update together — honor that).

**Verify**: `node tools/check-plan-archive.mjs` OK; release script parses
(`node --check tools/validate-release.mjs`); docs consistent.

## Test plan

- No product tests change. Proof: both static checks pass standalone and
  (for outcome (a)) appear in the release stage list in the right order.
- Verification: `node --check` + the two checks green.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] Owner decision recorded (or reversible-(a) with confirmation note).
- [ ] For (a): stage list in `validate-release.mjs` includes both checks in
      `validate` order. For (b): matrix + script header document ownership.
- [ ] `node --check tools/validate-release.mjs` passes.
- [ ] `node tools/check-plan-archive.mjs` prints OK.
- [ ] `git diff --name-only 0847089c...HEAD` lists only in-scope files.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report back (do not improvise) if:

- Either static check is red on the clean tree (baseline problem, not gate
  ownership).
- The release script's structure differs from Current state (drift).
- `admin:contract`/`admin:certify` turn out to be already invoked somewhere
  in the release path (then the premise is stale — report).

## Maintenance notes

- Gate changes MUST update the matrix + package.json + ADR triple together
  (the matrix says so — enforce it in review).
- This decision must not be re-audited without new evidence — the recorded
  decision is the record.
- **Deferred:** `admin:contract`/`admin:certify` gate placement (needs its
  own owner decision with CI-time data).
