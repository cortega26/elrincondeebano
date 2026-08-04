# Plan 073: Fix the import apply flow — new products, full objects, real result counts

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 30dbab7..HEAD -- admin/content-manager/src`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/070-commit-canonical-content-manager.md
- **Category**: correctness
- **Planned at**: commit `30dbab7`, 2026-08-03

## Why this matters

The import feature — the flagship way to load a catalog — is broken on both
sides of the wire:

- The client (`ImportPage.tsx`) builds the apply payload **only from resolved
  conflicts**, so products the preview reported as `no_conflicts` (the NEW
  products) are never sent; importing a catalog with new products silently
  imports nothing.
- The payload entries are partial `{ id, only-resolved-fields }` objects; the
  server's apply path does `Object.assign(existing, p)`, which merges partial
  fields onto the wrong target (matched by `id`, which legacy products have
  as `""`) and fails schema validation for objects missing required fields.
- The client reads `data.created`/`data.updated` from the apply response;
  the server returns no such fields, so the UI shows "Creados: undefined".

After this plan: the apply payload contains every preview product (with
resolutions), the server returns `applied/skipped/errors` counts, and the UI
shows the real result.

## Current state

Verified code (read directly):

- `admin/content-manager/src/web/app/routes/ImportPage.tsx:78-126`:
  ```tsx
  const resolved = conflicts.filter((c) => c.resolved);
  if (resolved.length === 0) { setError("No hay conflictos resueltos para aplicar"); ... }
  // Build products to apply from resolved conflicts
  const productMap = new Map<string, Record<string, unknown>>();
  for (const c of resolved) {
    if (!productMap.has(c.product_id)) productMap.set(c.product_id, { id: c.product_id });
    const entry = productMap.get(c.product_id)!;
    if (c.resolution === "use_incoming") entry[c.field] = c.incoming_value;
  }
  const response = await fetchWithCredential("/api/v1/import/apply", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ products: [...productMap.values()] }),
  });
  ...
  const data = (await response.json()) as { created: number; updated: number };
  setResult(`${conflicts.length} conflictos totales, ... Creados: ${data.created}, Actualizados: ${data.updated}`);
  ```
- Preview state available in the component: `setConflicts(data.conflicts)` and
  `setNoConflicts(data.no_conflicts)` (ImportPage.tsx:60-61) — the preview
  response already distinguishes them.
- `admin/content-manager/src/server/routes/changes.ts:182-278` — `/import/apply`
  handler: parses `{ products, resolutions }`, loads the catalog, and for each
  product either applies `resolutions` (field-level) or — in the branch the
  client currently triggers — does `Object.assign(existing, p)` (`:246`),
  collects failures into `errors`, and returns `{ ... }` without
  `created/updated` (`:266-271`). The `isSkipped` protocol at `:194-205`
  decides which products are skipped.
- The preview route (`changes.ts:92-180`) already counts new products —
  `changes.ts:165-167` — so the server contract for "no-conflict products
  must be applied" exists in the preview, just not honored by the client.

Repo conventions: React 19 + TS in `src/web/app/routes/`; `fetchWithCredential`
from `src/web/api/client.ts`; integration tests via `app.inject` — pattern
`test/integration/importApply.test.ts` exists and covers the server side.

## Commands you will need

| Purpose   | Command                   | Expected on success |
| --------- | ------------------------- | ------------------- |
| Typecheck | `npm run admin:typecheck` | exit 0              |
| Tests     | `npm run admin:test`      | exit 0              |
| Web build | `npm run admin:build:web` | exit 0              |

## Scope

**In scope**:

- `admin/content-manager/src/web/app/routes/ImportPage.tsx`
- `admin/content-manager/src/server/routes/changes.ts` (apply handler: return
  counts; apply full objects correctly for no-conflict products)
- `admin/content-manager/test/integration/importApply.test.ts` (extend)
- `admin/content-manager/src/web/api/client.ts` — only if the client helper
  needs a typed response shape.

**Out of scope**:

- The import **preview** comparison logic (unless a bug blocks Step 1).
- Change-set semantics and the state machine (plan 062 territory).
- The Python fallback's import.

## Git workflow

- Branch: `advisor/073-fix-lossless-import-apply`.
- Commit per step, conventional style (`fix(admin): import applies new products and reports real counts`), `Co-Authored-By: Claude <noreply@anthropic.com>` trailer.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Define the apply protocol on the server

Extend the `/import/apply` response to include counts. The handler computes
per-product outcomes as it processes the list — currently it collects
`errors`; add:

```ts
return { applied: <count of products actually written>, skipped: <count of isSkipped/no-change>, errors: <array> };
```

Keep the existing error/status behavior for the validation-failure branch
(4xx with `error.code`), and keep the `resolutions` field-level path working
unchanged.

**Verify**: `npx vitest run test/integration/importApply.test.ts` — update
assertions to the new response shape; all pass.

### Step 2: Send the full product set from the client

In `ImportPage.tsx` `handleApply`:

1. Build the payload from ALL preview products: for each `conflict` use
   `incoming_value` on `use_incoming` (as today) — but ALSO seed the map from
   `no_conflicts`, sending each as a **full product object** (the preview
   response carries the incoming product object — check its shape in the
   preview handler and pass it through).
2. Remove the `if (resolved.length === 0) abort` gate — an import of only-new
   products must apply.
3. Keep sending `resolutions` per the server's field-level protocol when the
   server supports it; if the server path for partial objects is the
   `Object.assign` branch, the full-object entries now satisfy schema
   validation (required `name`, `price`, `category` present).

**Verify**: `npm run admin:typecheck` exit 0; `npm run admin:build:web` exit 0.

### Step 3: Display the real result

Replace the `data.created/updated` readout with the new response fields:

```tsx
const data = (await response.json()) as {
  applied: number;
  skipped: number;
  errors: Array<{ product_id?: string; error: string }>;
};
setResult(
  `Aplicados: ${data.applied}, omitidos: ${data.skipped}${data.errors.length ? `, errores: ${data.errors.length}` : ''}`
);
```

Show the first error message inline if `data.errors.length > 0` (keep the
existing `error` state channel).

**Verify**: `npm run admin:build:web` exit 0; manual smoke via `npm run admin:dev` (optional, requires the UI) or the integration test in Step 4.

### Step 4: Integration test — new products import end to end

Extend `test/integration/importApply.test.ts` (or add
`importApplyNewProducts.test.ts` modeled on it) with:

1. Preview a payload containing a new product (no conflict) → preview reports
   it in `no_conflicts`.
2. Apply with the client-shaped payload (full object, no resolutions) → the
   product lands in the catalog file; response `applied === 1`.
3. Apply with a partial object missing `name` → response lists it in
   `errors`; nothing written.
4. Mixed: one conflicted (resolved `use_incoming`) + one new → both applied,
   the conflicted field uses the incoming value.

**Verify**: `npx vitest run test/integration/importApplyNewProducts.test.ts` → all pass.

## Done criteria

- [ ] Client sends all preview products (grep ImportPage.tsx: no
      `conflicts.filter((c) => c.resolved)`-only payload)
- [ ] No `data.created`/`data.updated` reads remain in ImportPage.tsx
- [ ] Server apply response includes `applied`/`skipped`/`errors`
- [ ] Integration test proves a new product is imported and a partial object
      is rejected
- [ ] `npm run admin:typecheck`, `npm run admin:test`, `npm run admin:build:web` exit 0
- [ ] `plans/README.md` status row 073 updated

## STOP conditions

Stop and report back (do not improvise) if:

- The preview response doesn't carry the full incoming product object for
  `no_conflicts` entries (check the preview handler at changes.ts:92-180
  first; if it only carries ids, extend the preview — that is in scope).
- The server's `isSkipped` protocol turns out to skip new products by design
  (read changes.ts:194-205 before wiring the client; report what you find).
- The UI tests (if any exist for ImportPage) contradict the new flow.

## Maintenance notes

- The apply response shape is now the client-server contract for import —
  any future change to the server handler must keep `applied/skipped/errors`
  or update ImportPage in the same change.
- Plan 060 (lossless import/export) supersedes this flow's preview logic
  later; this plan just makes the current flow truthful.
- Reviewer focus: the no-conflict product payload must round-trip through
  `productSchema.safeParse` on the server — if the preview object lacks a
  field the schema requires, the fix is to normalize on the client, not to
  loosen the schema.
