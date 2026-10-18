# Plan 230: Comms correctness batch — repeat guard for pasted numbers, honest phone validation, honest persistence, no object-URL leaks, sanitized 500s

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 97b21096..HEAD -- admin/content-manager/src/web/app/routes/CommsPage.tsx admin/content-manager/src/shared/comms.ts admin/content-manager/src/server/routes/commsRoutes.ts admin/content-manager/test/contract/comms.test.ts admin/content-manager/test/integration/commsApi.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none (runs before the CommsPage split, plan 240)
- **Category**: bug/security
- **Planned at**: commit `97b21096`, 2026-10-18

## Why this matters

Five verified defects in the private `/comms` module (plan 217 / ADR 0011):

1. **Repeat guard dead for pasted numbers.** `findRecentRepeat` requires
   `entry.destination_id === destinationId`, but ad-hoc sends are stored
   with `destination_id: null` (`CommsPage.tsx:285-287`) while the lookup
   passes the ad-hoc marker id (`'__adhoc__'`, `:233`). The
   "Este mismo texto ya fue a este destino" warning — the only guard against
   double-broadcasting — never fires for "Pegar un número…", the natural
   path for one-off neighbour messages.
2. **`normalizePhone` accepts undialable numbers.** A leading `+` bypasses
   the 9-digit heuristic, so `+9 1234 5678` → `912345678` passes
   `/^[1-9][0-9]{7,14}$/` and the UI marks it valid; `wa.me` then rejects
   it. A bare landline `22334455` also passes.
3. **Persistence lies.** `handleConfirmSent` awaits `logActivity(...)`,
   ignores `null` and always toasts "Registrado como enviado" — a failed
   write silently loses an audit entry. And `persist` closes over `doc`
   from the render, so two quick same-tab actions send the same
   `expected_rev`; the 409 is then reported as "Los datos cambiaron en otra
   pestaña".
4. **Object-URL leak.** `URL.createObjectURL(file)` per attached image is
   never revoked (page-lifetime blobs, multi-MB each).
5. **500 leaks paths.** `commsRoutes.ts:16-20` returns
   `(err as Error).message` verbatim; `jsonFileRepository.ts:33-47`
   messages are `Invalid JSON in <abs path>` / `Schema validation failed
for <abs path>` — exactly the "no operator paths" contract the rest of
   the admin enforces (`AppError.ts:28-33 sanitizeUserMessage`, plan 090).

## Current state

- `CommsPage.tsx:233` — `const repeat = doc && destination ?
findRecentRepeat(doc.activity, destination.id, hash) : null;`
- `CommsPage.tsx:283-288` — `logActivity` stores
  `destination_id: destination.id === ADHOC_ID ? null : destination.id`.
- `shared/comms.ts:183-202` — `findRecentRepeat(activity, destinationId,
hash, now, days)`, exact-match on `destination_id`.
- `shared/comms.ts:61-73` — `normalizePhone` (see quoted rules in file).
- `CommsPage.tsx:392-397` — `handleConfirmSent`.
- `CommsPage.tsx:186-204` — `persist` (`client.saveComms(mutate(doc), doc.rev)`).
- `CommsPage.tsx:402-412` — own-image `URL.createObjectURL` loop.
- `commsRoutes.ts:16-20` — raw `err.message` in the 500 envelope.
- Tests: `test/contract/comms.test.ts` (pure logic — add cases here),
  `test/integration/commsApi.test.ts` (temp repo + inject),
  `test/e2e/comms.spec.ts` (mock route; ad-hoc flow at `:117-123`).

## Commands you will need

| Purpose       | Command                                                                                                      | Provenance | Expected on success |
| ------------- | ------------------------------------------------------------------------------------------------------------ | ---------- | ------------------- |
| Install       | `npm ci`                                                                                                     | declared   | exit 0              |
| Focused tests | `npx vitest run test/contract/comms.test.ts test/integration/commsApi.test.ts` (cwd `admin/content-manager`) | declared   | all pass            |
| Admin tests   | `npm run admin:test`                                                                                         | declared   | all pass            |
| Admin e2e     | `npx playwright test -c playwright.config.ts test/e2e/comms.spec.ts` (cwd `admin/content-manager`)           | declared   | pass                |
| Typecheck     | `npm run admin:typecheck`                                                                                    | declared   | exit 0              |

## Scope

**In scope**:

- `admin/content-manager/src/web/app/routes/CommsPage.tsx`
- `admin/content-manager/src/shared/comms.ts`
- `admin/content-manager/src/server/routes/commsRoutes.ts`
- `admin/content-manager/test/contract/comms.test.ts`
- `admin/content-manager/test/integration/commsApi.test.ts`
- `admin/content-manager/src/shared/schemas/comms.ts` (only the phone
  schema error text, if the new validation needs a clearer message)

**Out of scope**:

- `handoff.ts` (`safeFileName`/`validateOwnImage` are covered by plan 231's
  test batch).
- The CommsPage split (plan 240) — that comes after this plan lands, so
  behavior here is frozen first.
- ADR 0011 semantics (wa.me handoff, no server sending, PII rules).

## Git workflow

- Branch: `advisor/230-comms-correctness`
- Commits: one per numbered defect, `fix(admin/comms): … (plan 230)`.

## Steps

### Step 0: Establish a green baseline

Install + focused tests on the unmodified checkout. Red → STOP.

### Step 1: Repeat guard for ad-hoc destinations

In `CommsPage.tsx`, look up with `null` when the destination is ad-hoc:

```ts
const repeatDestinationId = destination && destination.id !== ADHOC_ID ? destination.id : null;
const repeat = doc ? findRecentRepeat(doc.activity, repeatDestinationId, hash) : null;
```

Keep the existing warning UI; the copy already says "a este destino" — for
the ad-hoc case that means "un número pegado", which the existing copy does
not contradict. Do not change stored data (`destination_id: null` stays).

Contract test (`comms.test.ts`): `findRecentRepeat` matches a stored
`destination_id: null` entry when called with `null`, and does NOT match
when called with a stored-id destination.

### Step 2: Honest phone validation

Tighten `normalizePhone` (`shared/comms.ts:61-73`) to:

- `00`-prefixed: strip and continue (unchanged).
- `+`-prefixed: after stripping non-digits, require **10–15 digits**
  (rejects `+9…`/`+2…` short shapes); strip leading `00` handling as today.
- No `+`: accept only the known Chilean shapes:
  `9XXXXXXXX` (9 digits, leading 9) → prefix `56`; or digits already
  starting with `56` of length 11. Anything else (e.g. bare 8-digit
  landlines) → `null`.
- Keep `//^[1-9][0-9]{7,14}$/` as a final guard and the existing
  `digits.startsWith('56') && digits.length !== 11` rejection.

Update the schema error message in `shared/schemas/comms.ts:64-66` if the
current text ("Número internacional inválido…") no longer describes the
rule; the CommsPage inline feedback (`CommsPage.tsx:596`) shows whatever the
schema returns.

Contract test matrix (≥8 cases): `+56 9 1234 5678` ok; `9 1234 5678` ok →
`56912345678`; `56912345678` ok; `+9 1234 5678` rejected; `22334455`
rejected; `+56 22334455` rejected (length 10 with CC 56 + 8 = correct? keep
the explicit rule: `56` must be length 11 → rejected); `00 56 9 …` ok;
garbage rejected.

### Step 3: Honest persistence

- `handleConfirmSent` (`:392-397`):

  ```ts
  const saved = await logActivity('enviado_manual');
  if (!saved) {
    notify('error', 'No se pudo registrar el envío. Inténtalo de nuevo.');
    return; // keep pendingConfirm so the operator can retry
  }
  setPendingConfirm(null);
  notify('success', 'Registrado como enviado (confirmación manual).');
  ```

- `persist` rebase: keep a `docRef` updated at every `setDoc` call (wrap in
  a small `applyDoc(next)` helper used by all setters, or use
  `setDoc(prev => { docRef.current = prev; return prev; })` after each
  set). `persist` then reads `docRef.current` for both `mutate` and
  `rev`. Genuine cross-tab conflicts still 409 (and the existing reload
  path stays). Optionally refine the 409 copy to "El documento cambió —
  recargado; inténtalo de nuevo" since rapid same-tab actions no longer
  reach it.

**Verify** (Step 3): the admin component tests for comms (if any) and
`test/integration/commsApi.test.ts` stay green; add a web-level test only if
a harness for CommsPage exists — otherwise note that the rebase is covered
by the e2e flow (Step 6).

### Step 4: Revoke object URLs

Track created URLs on the `ownImages` entries (`src` is the object URL) and
revoke:

- in the remove handler (whichever `setOwnImages(prev => prev.filter(...))`
  removes an image),
- in a `useEffect(() => () => { ownImages.forEach(i => URL.revokeObjectURL(i.src)) }, [])`
  unmount cleanup (use a ref to the latest list so the effect stays
  mount-only).

Do not revoke URLs still displayed; if a "replace" path reuses an entry,
revoke the old `src` when swapping.

### Step 5: Sanitized comms 500

`commsRoutes.ts` GET catch:

```ts
try {
  return repo.read();
} catch (err) {
  request.log.error({ err }, 'comms read failed');
  return reply.status(500).send({
    error: { code: 'COMMS_UNREADABLE', message: 'No se pudo leer el documento de comunicaciones' },
  });
}
```

(use the route's `request` argument — rename `_request`). Add an
integration test in `commsApi.test.ts`: corrupt `data/.comms/comms.json`
(broken JSON) → GET returns 500 with the fixed message and **no** absolute
path / no zod details in the body; the server log call may contain details.

### Step 6: Tests + e2e

Run the focused tests and `comms.spec.ts`. The e2e ad-hoc phone
(`9 1111 2222`) remains valid under Step 2 (mobile heuristic). If the
e2e asserts any message copy you changed in Step 3, update the assertion
and note it.

### Step 7: Full gates

**Verify**: `npm run admin:test` → all pass; `npm run admin:lint` → exit 0;
`npm run admin:typecheck` → exit 0.

## Test plan

- `comms.test.ts`: repeat-guard null case; phone matrix (≥8).
- `commsApi.test.ts`: sanitized 500.
- `comms.spec.ts`: unchanged green (regression net).
- Object-URL revocation: covered by code review + a storage/units check if
  the harness allows spying on `URL.revokeObjectURL`; otherwise note.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run admin:test` exits 0 including the new comms cases
- [ ] `grep -n "repeatDestinationId" admin/content-manager/src/web/app/routes/CommsPage.tsx` matches
- [ ] `grep -n "COMMS_UNREADABLE', message: 'No se pudo leer" admin/content-manager/src/server/routes/commsRoutes.ts` matches
- [ ] `grep -n "(err as Error).message" admin/content-manager/src/server/routes/commsRoutes.ts` returns nothing
- [ ] `grep -c "revokeObjectURL" admin/content-manager/src/web/app/routes/CommsPage.tsx` ≥ 2
- [ ] `comms.spec.ts` passes
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The tightened phone rules reject numbers the operator demonstrably uses
  (check the e2e fixtures + `COMMS.md` examples; report the case instead of
  widening silently).
- The `persist` rebase changes the 409-reload behavior in a way a test
  contradicts (report).
- The comms e2e suite asserts the old "otra pestaña" copy for a same-tab
  sequence (that would pin the bug; report before changing).
- A `declared` command fails on the unmodified checkout (Step 0).

## Maintenance notes

- Ad-hoc → `destination_id: null` is the privacy rule; any future matching
  must treat `null` as a first-class destination class.
- Reviewer: verify no `URL.createObjectURL` call path lacks a revoke
  (search once more after the change).
- **Deferred:** web-level component tests for the rebase (no CommsPage
  harness today); revisit if a harness is introduced for plan 240.
