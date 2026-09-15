# Plan 197: Split ContentManagerClient, converge fetch paths, fix the service→route type cycle

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 0847089c..HEAD -- admin/content-manager/src/web/api/client.ts admin/content-manager/src/web/app/credentialStore.ts admin/content-manager/src/server/adapters/syncAdapter.ts admin/content-manager/src/server/services/changeSetApplier.ts admin/content-manager/src/server/routes/helpers.ts admin/content-manager/src/domain/publication/publicationService.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: plans/170-land-working-tree-baseline.md, plans/192-web-contract-coverage.md
- **Category**: tech-debt
- **Planned at**: commit `0847089c`, 2026-09-14

## Why this matters

The API client is a 788-line god object (~30 methods across every domain)
where one method (`exportCsv`) bypasses the unified `request()` core — raw
`fetch` with no credential injection and no 401 `resetCredential` — producing
stale-credential bugs exclusive to CSV export. Two more fetch wrappers
(`fetchWithCredential` without 401 reset, raw server-side `fetch` in
`syncAdapter`) plus a fourth copy in the prototype mean token handling is
audited in N places. And a type-only cycle (`changeSetApplier` imports
`Repositories` from `routes/helpers`, which imports services) blocks future
layer lint and clean domain reuse. Mechanical splits behind the same facade;
contract tests (plan 192 pins them) prove shape stability.

## Current state

All excerpts verified by advisor read:

```ts
// client.ts:236-788 — one class: base URL, credential, 401 reset, envelope + ~30 domain methods
// client.ts:250-294 — unified request() (credential + 401 resetCredential)
// client.ts:603-614 — exportCsv bypasses it:
async exportCsv(query: CsvExportQuery = {}): Promise<Response> {
  const params = new URLSearchParams(); ... // param mapping duplicated from getProducts (lines 296-328)
  return fetch(`${this.baseUrl}/api/v1/export.csv${qs ? ... : ''}`);  // raw: no credential, no 401 reset
}
```

```ts
// credentialStore.ts:71-85 — fetchWithCredential: credential, NO 401 reset, module _credential (not getCredentialValue)
// syncAdapter.ts:130,229 — raw server-side fetch ×2
// web/api/__prototype__/typedClient.prototype.ts:71-106 — fourth copy of request()
// (both prototype files have ZERO importers outside prototype dirs — verified)
```

```ts
// changeSetApplier.ts:5 — type-only cycle into routes
import type { Repositories } from '../../server/routes/helpers.ts';
// helpers.ts:2-5 — routes import repositories + ProductService
// publicationService.ts:37-40 — domain imports gitAdapter TYPE via import(...).GitAdapter.prototype.getChanges
```

Conventions: plan 151 routed all fetches through `ContentManagerClient` —
this plan finishes that convergence; plan 057 token-redaction posture must
hold in the single core afterwards. Prototype disposition: adopt-or-delete
per spike 163 (plan 214 owns the typed-client decision — this plan only
removes the DUPLICATE `request()` copy if the prototype stays, or deletes
the dir if 214 already retired it; coordinate order).

## Commands you will need

| Purpose   | Command                   | Provenance | Expected on success                    |
| --------- | ------------------------- | ---------- | -------------------------------------- |
| Install   | `npm ci`                  | declared   | exit 0                                 |
| Typecheck | `npm run admin:typecheck` | declared   | exit 0                                 |
| Tests     | `npm run admin:test`      | declared   | all pass (esp. plan 192's client pins) |

## Scope

**In scope**: per-domain method groups behind the same `Client` facade;
`exportCsv` through `request()`; single browser + single server fetch cores;
`Repositories` type move; prototype duplicate resolution.

**Out of scope**: new endpoints; envelope shape changes (byte-identical
requests/responses — prove with plan 192's tests); the typed-client codegen
decision (plan 214); `syncAdapter` retry semantics.

## Git workflow

- Branch: `advisor/197-client-fetch-layering`
- Commit per slice (cycle → exportCsv+core → split → prototype).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 0: Baseline

Requires plans 170 + 192 DONE (192's client pins are the safety net). Full
admin suite green. Confirm prototype still unreferenced (grep from Current
state).

**Verify**: green; otherwise STOP.

### Step 1: Break the type cycle (no runtime change)

Move `Repositories` to `server/repositories/types.ts` (new, types only);
update `helpers.ts` (re-export for compatibility if anything imports it from
there — check), `changeSetApplier.ts`, and all route files. Domain→adapter:
invert `publicationService`'s gitAdapter type import into an injected port
interface (minimal: a structural type declared in domain, satisfied by the
adapter — no runtime change). Type-only diff; runtime behavior identical.

**Verify**: typecheck green; tests green.

### Step 2: Route exportCsv through request() + single browser core

- `exportCsv` delegates to `request()` (which must support binary/Response
  returns — extend the core minimally, keeping JSON as default). Credential
  - 401 reset now apply to CSV export. Update plan 192's exportCsv pin-test
    in the SAME commit (it pinned the old raw behavior).
- Collapse `fetchWithCredential` to delegate to the same core (credential +
  401 reset everywhere); server side: single fetch core in adapters used by
  both `syncAdapter` call sites (keep timeout/retry behavior identical).

**Verify**: typecheck + tests green (updated pin-test proves the new path).

### Step 3: Split by domain behind the facade

Extract per-domain method groups (products, categories/nav, storefront,
media, import/export, publications/jobs, sync/conflicts/backups) into
modules sharing the one `request()` core; `ContentManagerClient` keeps its
public shape (facade delegating — zero call-site churn). Dedup the
`getProducts`↔`bulkPreview/bulkApply` filter mapping (lines 296-328 vs
650-752) into one mapper as part of the move.

**Verify**: typecheck + full suite green; public API surface diffed
(no added/removed methods — assert by review + tests).

### Step 4: Resolve the prototype duplicate

If plan 214 already retired the prototype dir → nothing to do (verify
absence). Else if it stays → delete the duplicated `request()` copy inside
`typedClient.prototype.ts` by importing the real core (or mark the file
explicitly as reference-only with a header — prefer deletion of the dup).
Never leave two `request()` implementations.

**Verify**: single `request()` implementation repo-wide (grep proves it).

## Test plan

- Plan 192's client integration pins (extended where behavior intentionally
  changes: exportCsv credential/401).
- Type-cycle: compile-level (no runtime test needed; suite green proves no
  breakage).
- Verification: full `npm run admin:test` green.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run admin:typecheck` exits 0; `npm run admin:test` exits 0.
- [ ] `grep -n "from './helpers" admin/content-manager/src/server/services/changeSetApplier.ts` returns no matches (cycle broken).
- [ ] `grep -n "return fetch(" admin/content-manager/src/web/api/client.ts` returns no matches (no raw-fetch bypass).
- [ ] Exactly one `request()` core implementation (grep-count documented in commit).
- [ ] Facade public surface unchanged (review-attested + tests green).
- [ ] `git diff --name-only 0847089c...HEAD` lists only in-scope files.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report back (do not improvise) if:

- `request()` cannot return binary `Response` without restructuring its
  envelope handling (report the shape; do not rebuild the client core here).
- The facade split requires call-site changes (then it is not mechanical —
  narrow to Steps 1–2 + 4 and report).
- Plan 214 already owns the prototype files differently (reconcile; do not
  double-edit).
- Any `declared` command fails on the unmodified checkout.

## Maintenance notes

- New API methods go in their domain module + use the core (header comment
  rule in `client.ts`); new fetch wrappers are banned (point at this plan).
- Token handling is now audited in exactly ONE browser core + ONE server
  core — the plan-057 posture follows automatically.
- Reviewer: verify binary-response handling and 401-reset on the CSV path
  explicitly (the original bug).
- **Deferred:** typed-client codegen (plan 214).
