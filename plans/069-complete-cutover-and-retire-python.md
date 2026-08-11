# Plan 069: Complete evidence-based cutover and retire the Python fallback

> **Executor instructions**: This is the terminal migration plan. Do not start it until
> every dependency is DONE and certification is green from current-commit evidence.
> Retirement requires explicit operator acceptance and a rehearsed rollback; documentation
> claims must be generated from real status, not aspiration.
>
> **Drift check (run first)**:
> `git diff --stat 30dbab7..HEAD -- docs admin/content-manager admin/product_manager .github/workflows package.json plans/README.md plans/archive/055-progress.md`

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: 056–068
- **Category**: migration / docs / operations
- **Planned at**: commit `30dbab7`, 2026-07-16
- **Findings covered**: F21 and final acceptance of F01–F20

## Why this matters

`CUTOVER.md` says the TS manager is fully functional and certified while Plan 055 still
lists major phases TODO, onboarding omits the workspace, canonical CI remains Python/
retired Streamlit oriented, and the documented startup is not presently a complete
operator path. Python should be retired only after executable parity, shadow operation,
failure recovery, and clean-clone rehearsal prove it is unnecessary.

## Current state

- `docs/operations/CUTOVER.md:8-23` claims full functionality/21-of-21 and names TS
  startup as canonical.
- `plans/archive/055-progress.md` marks phases 6–12 TODO despite live code claiming later work.
- `docs/onboarding/BOOTSTRAP.md:21` describes only root/Astro workspaces.
- `.github/workflows/admin.yml` tests Python/Tk and retired `admin/web`, not TS.
- `plans/README.md` records Plan 055 only through Phase 2 in its current top-level row.
- Python remains the only complete source for several workflows until plans 060–066 land.

Repository convention: docs are an evidence index, the repository is the system of
record, and rollback uses `git revert`, never destructive reset.

## Commands you will need

| Purpose                  | Command                                                                           | Expected on success                |
| ------------------------ | --------------------------------------------------------------------------------- | ---------------------------------- |
| Clean install            | `npm ci`                                                                          | exit 0 on a clean clone            |
| Admin validation         | `npm run admin:validate`                                                          | exit 0                             |
| Admin E2E                | `npm run admin:test:e2e`                                                          | all workflows pass                 |
| Certification            | `npm run admin:certify`                                                           | READY, all required rows evidenced |
| Root validation          | `npm run validate`                                                                | exit 0                             |
| Release validation       | `npm run validate:release`                                                        | exit 0                             |
| Python fallback baseline | `admin/product_manager/.venv/bin/python -m pytest admin/product_manager/tests -q` | pass before retirement commit      |

## Scope

**In scope**:

- clean-clone/shadow/cutover rehearsal scripts and evidence
- `docs/operations/CUTOVER.md`, onboarding, runbook, validation matrix, rollback docs
- CI/workspace scripts and active admin workflow ownership
- Plan 055 status/progress reconciliation and archival/retirement of Python documentation
- Python fallback removal/archive only after all gates and explicit approval

**Out of scope**:

- Fixing failed parity behavior inside this terminal plan; reopen the owning plan.
- Deleting historical plans, fixtures, ADRs, or migration evidence.
- Publishing/pushing/deploying without explicit operator authorization.
- Removing Python before a tagged/revertible fallback point exists.

## Git workflow

- Branch: `migration/069-content-manager-cutover`
- Use separate commits for evidence/docs, CI switch, and Python retirement.
- Do not push, publish, tag, or open a PR unless instructed.

## Steps

### Step 1: Reconcile one migration-status source

Make Plan 055/progress and executable certification agree. Generate the cutover summary
from current evidence. Mark stale declarations and old Tk-directed plans superseded or
archived without erasing history.

**Verify**: no documentation says complete when `admin:certify` is non-zero; status links
resolve to current-SHA artifacts and owning plans.

### Step 2: Run clean-clone and shadow certification

From a disposable clean clone/copy with synthetic or approved shadow data, run install,
startup, all operator workflows, restart, recovery, import/export, media, sync fake remote,
publication dry-run, and storefront build. Compare Python/TS results on the frozen corpus
and record unexplained differences as blockers.

**Verify**: two consecutive runs produce zero unexplained differences and require no
manual JSON/filesystem repair. Evidence is commit-bound and credential-free.

### Step 3: Rehearse rollback and failure scenarios

Exercise failed validation, media failure, interrupted apply, sync disconnect/conflict,
Git staging conflict, failed push, backup restore, process kill/restart, and revert to the
fallback tag/commit. Confirm repository and operator recovery instructions.

**Verify**: each drill has machine evidence and ends with the expected canonical file/
Git state; no production remote or catalog is used.

### Step 4: Obtain explicit operator acceptance

Walk the complete parity ledger with the maintainer, including lower-frequency tools,
accessibility, performance, diagnostics, and recovery. Record signed acceptance in the
certification format. Any waiver must name capability, rationale, owner, and expiry; the
default for this migration is no missing Python functionality.

**Verify**: `npm run admin:certify` reports READY only after acceptance exists for the
current release candidate.

### Step 5: Switch CI and documentation

Make TS the active canonical admin workflow, remove retired Streamlit CI, update bootstrap,
START_HERE, validation matrix, runbook, smoke, cutover, incident, and rollback docs. Keep
Python fallback tests available through the final retirement commit.

**Verify**: all links/commands work from clean clone; required TS CI is green and no active
doc directs normal operations to Python or retired Streamlit.

### Step 6: Retire Python reversibly

Create the approved tag/commit boundary, archive or remove `admin/product_manager` and its
runtime dependencies as decided, and preserve fixtures/history needed for audit. Perform
the removal in its own revertible commit. Do not remove Python if any certification row,
rollback drill, or operator acceptance is incomplete.

**Verify**: clean clone requires no Python for any admin workflow; `npm run validate`,
`validate:release`, `admin:validate`, E2E, and certification all pass after removal.

## Test plan

- Use every executable scenario from Plan 056 on a disposable clean clone.
- Differential Python/TS run before retirement; TS-only run after retirement.
- Failure matrix covers mutation, media, sync, publication, backup, and shutdown.
- Link/command validation for all changed operational docs.

## Done criteria

- [ ] Plans 056–068 are DONE and current-SHA certification is READY.
- [ ] Two clean shadow runs have zero unexplained differences/manual repair.
- [ ] Rollback/failure drills pass with recorded evidence.
- [ ] Explicit operator acceptance is recorded.
- [ ] TS is the required canonical CI/admin path; retired Streamlit paths are gone.
- [ ] Active docs are mutually consistent and command-tested.
- [ ] Python removal is isolated, revertible, and leaves every admin workflow available.
- [ ] Full admin/root/release validation passes after retirement.

## STOP conditions

- Any dependency plan is not DONE or certification evidence is stale/failing.
- A Python workflow lacks a tested TS equivalent or an explicit accepted waiver.
- Shadow runs differ or require manual JSON/filesystem repair.
- Rollback cannot restore a usable manager and canonical repository state.
- Operator acceptance is unavailable.

## Maintenance notes

After cutover, prohibit static certification claims and undocumented fallback code.
Retain compatibility fixtures and migration evidence as regression assets; revisit the
parity ledger whenever the Content Manager gains a new durable workflow.
