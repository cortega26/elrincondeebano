# Plan 231: Close the highest-value test gaps (encodeCart, comms PII draft, comms client, checkout wiring, handoff) and ratchet two coverage floors

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 97b21096..HEAD -- astro-poc/src/scripts/storefront.js astro-poc/src/scripts/storefront/storefront-state.ts test/storefront-state.spec.js test/order-submit.spec.js test/e2e-astro/cart-ux.spec.ts test/e2e-astro/storage-contract.spec.ts admin/content-manager/test/e2e/comms.spec.ts admin/content-manager/test/integration/clientIntegration.test.ts admin/content-manager/test/contract/handoff.test.ts vitest.config.mts admin/content-manager/vitest.config.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: 219, 230 (this plan freezes their behavior with tests)
- **Category**: tests
- **Planned at**: commit `97b21096`, 2026-10-18

## Why this matters

Five verified dangerous gaps (each one is a stated behavior with zero
coverage — a regression ships silently):

1. **Cart-share encoder untested.** `encodeCart`/`getShareableCartUrl`
   (`storefront.js:199-224`) have no test; e2e T11
   (`cart-ux.spec.ts:368`) reimplements the encoder (`Buffer.from(encodeURIComponent(JSON.stringify(...)))`)
   and therefore verifies only the decoder, and the share button is tested
   with an injected `shareCart: vi.fn()` double
   (`test/cart-share-feedback.spec.js:34`).
2. **Comms draft PII stripping untested.** `saveDraft`
   (`CommsPage.tsx:91-109`) deliberately drops `values.nombre`, `adhocPhone`
   and the `__adhoc__` destination before writing localStorage (fix
   `204f2680`, ADR 0011) — no test references `cm-comms-draft-v1`.
3. **Comms client slice mocked-only.** `clientIntegration.test.ts` exercises
   `ContentManagerClient` against a real Fastify server but has **no comms
   calls**; the e2e intercepts `**/api/v1/comms` with an echo route.
   Path/field drift (`document` vs `doc`, lost `cache: 'no-store'`) passes
   everything.
4. **Checkout payload integration untested.** `test/order-submit.spec.js`
   injects its own `formatCurrency`/`getCartState` doubles (`:15-39`) and
   asserts `buildWhatsAppPreview` `toHaveBeenCalled()` with no argument
   (`:175`); the e2e only counts `window.open` calls. A wrong total or
   truncated message ships silently.
5. **Handoff helpers untested.** `admin/.../web/app/comms/handoff.ts`
   (`validateOwnImage:9-18`, `canShareFiles:61-71`, `safeFileName:137-145`)
   has no unit test at all.

Plus: the coverage floors (root `33/25/28/33`; admin `40/25`) are too low to
see any single new surface — ratchet the two smallest, highest-value modules.

## Current state

- `storefront.js:199-224` — `encodeCart` (pure: `btoa(encodeURIComponent(JSON.stringify(toSharedCartPayload(cart))))`),
  `decodeCart`, `getShareableCartUrl`.
- `storefront-state.ts:126` — `getCartState` is exported.
- `astro-poc/src/lib/formatting.ts:3` — `formatCurrency` (the production
  one; `storefront.js:33` imports it).
- `admin/content-manager/src/web/app/routes/CommsPage.tsx:51,91-109` —
  `DRAFT_KEY = 'cm-comms-draft-v1'` + `saveDraft`.
- `admin/content-manager/src/web/api/comms.ts:6-19` — `getComms`/`saveComms`
  (`{ expected_rev, document }`, `cache: 'no-store'` on GET).
- `admin/content-manager/test/integration/clientIntegration.test.ts` — real
  server pattern; `grep -n comms` → zero hits.
- `test/order-submit.spec.js:15-56,175`.
- Admin e2e harness for comms: `admin/content-manager/test/e2e/comms.spec.ts`
  (routes mocked; ad-hoc typing at `:117-123`, mobile at `:251-258`).

## Commands you will need

| Purpose       | Command                                                                                                                 | Provenance | Expected on success |
| ------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------- |
| Install       | `npm ci`                                                                                                                | declared   | exit 0              |
| Root focused  | `npx vitest run test/storefront-state.spec.js test/order-submit.spec.js`                                                | declared   | all pass            |
| Root e2e      | `npm run test:e2e -- cart-ux.spec.ts storage-contract.spec.ts`                                                          | declared   | pass                |
| Root coverage | `npm run test:coverage`                                                                                                 | declared   | thresholds pass     |
| Admin focused | `npx vitest run test/contract/handoff.test.ts test/integration/clientIntegration.test.ts` (cwd `admin/content-manager`) | declared   | all pass            |
| Admin e2e     | `npx playwright test -c playwright.config.ts test/e2e/comms.spec.ts` (cwd `admin/content-manager`)                      | declared   | pass                |
| Admin cover.  | `npm run admin:test:coverage`                                                                                           | declared   | thresholds pass     |

## Scope

**In scope**:

- `astro-poc/src/scripts/storefront.js`, `astro-poc/src/scripts/storefront/storefront-state.ts`
- `test/storefront-state.spec.js`, `test/order-submit.spec.js`
- `test/e2e-astro/cart-ux.spec.ts` (or a new spec if cleaner — prefer extending)
- `admin/content-manager/test/e2e/comms.spec.ts`
- `admin/content-manager/test/integration/clientIntegration.test.ts`
- `admin/content-manager/test/contract/handoff.test.ts` (create)
- `vitest.config.mts`, `admin/content-manager/vitest.config.ts` (thresholds only)

**Out of scope**:

- Behavior changes beyond what a test forces: if a test exposes a real bug,
  STOP and report (do not fix it here).
- The SSR-anchor test (plan 236) and the build-contract CI wiring (plan 233).

## Git workflow

- Branch: `advisor/231-test-gaps`
- Commits: one per gap, `test(cart): … (plan 231)`.

## Steps

### Step 0: Establish a green baseline

Install + root/admin focused suites on the unmodified checkout. Red → STOP.

### Step 1: encodeCart producer coverage

Move `encodeCart`/`decodeCart` from `storefront.js` into
`storefront-state.ts` (pure module; keep `getShareableCartUrl` in
`storefront.js` importing the moved functions; re-export from
`storefront.js` only if something else uses them — check first).

Unit tests (`test/storefront-state.spec.js`):

- encode→decode→`hydrateSharedCart` round-trip for a 3-item cart;
- unicode product names (`Nova Clásica ✨`) survive `btoa` via
  `encodeURIComponent`;
- malformed input (not base64 / not JSON / wrong shape) → `null`/`[]`;
- empty cart → `null` URL payload.

E2E (`cart-ux.spec.ts`, extend T11 area): click the real "Compartir
carrito" button with `navigator.share` undefined and clipboard permissions
granted (`context.grantPermissions(['clipboard-read', 'clipboard-write'])`),
read the clipboard text, and either navigate to the extracted `#cart=` URL
and assert the cart renders — or, if clipboard access proves flaky in CI,
stub `navigator.clipboard.writeText` in-page, capture the argument, and
assert it decodes via the production path. State in a test comment which
mode is used.

**Verify**: `npx vitest run test/storefront-state.spec.js` → pass;
`npm run test:e2e -- cart-ux.spec.ts` → pass.

### Step 2: Comms draft PII e2e

Extend `admin/content-manager/test/e2e/comms.spec.ts`: in the ad-hoc flow
(type a phone and a `{nombre}=Luis` value), reload the page, then assert:

- the draft survives (template/text restored), and
- `localStorage.getItem('cm-comms-draft-v1')` contains **neither** the
  phone digits nor `Luis`.

**Verify**: admin e2e comms spec → pass.

### Step 3: Comms client integration

Extend `clientIntegration.test.ts` with a comms round-trip against the real
server: seed valid `data/.comms/comms.json` (or empty doc), GET via the
client → PUT with `expected_rev` → success; second PUT with the stale rev →
409; assert the GET response carried `Cache-Control: no-store` through the
client (read the raw response the same way existing cases do).

**Verify**: `npx vitest run test/integration/clientIntegration.test.ts` (cwd
admin) → pass.

### Step 4: Checkout wiring with production functions

In `test/order-submit.spec.js`: import `formatCurrency` from
`../astro-poc/src/lib/formatting.ts` and `getCartState` from
`../astro-poc/src/scripts/storefront/storefront-state.ts`; delete the local
doubles; keep the rest of the harness. Strengthen the preview assertion:
`expect(buildWhatsAppPreview).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining(/* total for the fixture cart */) }))`
— compute the expected total from the fixture.

E2E (storage-contract.spec.ts order flow): capture the `window.open` URL in
the existing order test and assert it contains the expected total substring
(URL-encoded digits).

**Verify**: `npx vitest run test/order-submit.spec.js` → pass; e2e
storage-contract → pass.

### Step 5: Handoff unit tests

Create `admin/content-manager/test/contract/handoff.test.ts`:

- `validateOwnImage`: wrong type, empty file, >10 MB, valid PNG → messages;
- `safeFileName`: accents/unicode/empty/`..` segments → sanitized default
  (`imagen.ext`) and no path separators;
- `canShareFiles`: `navigator.share` absent / `canShare` throwing / valid →
  booleans (stub `navigator` like the web tests do).

**Verify**: focused admin test → pass.

### Step 6: Ratchet two coverage floors

- Root `vitest.config.mts`: add glob-scoped thresholds for the module this
  batch covers, e.g.
  `thresholds: { statements: 33, …, 'astro-poc/src/scripts/storefront/sw-registration.js': { lines: <achieved − 5>, functions: <achieved − 5> } }`
  (vitest supports per-glob keys under `coverage.thresholds`).
- Admin `vitest.config.ts`: same for
  `admin/content-manager/src/shared/comms.ts`.
  Measure first (`npm run test:coverage`, `npm run admin:test:coverage`),
  then set floors 5 points below achieved. Do not raise the global floors
  in this plan.

**Verify**: `npm run test:coverage` → thresholds pass;
`npm run admin:test:coverage` → thresholds pass.

### Step 7: Full gates

**Verify**: `npm test` → all pass; `npm run lint` → exit 0;
`npm run admin:test` → all pass.

## Test plan

- New tests listed in Steps 1-5; thresholds in Step 6.
- Patterns: `test/storefront-state.spec.js` (pure), `cart-ux.spec.ts`
  (e2e), `clientIntegration.test.ts` (real-server integration),
  `comms.spec.ts` (admin e2e).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npx vitest run test/storefront-state.spec.js test/order-submit.spec.js` exits 0 with the new cases
- [ ] `npm run test:e2e -- cart-ux.spec.ts storage-contract.spec.ts` passes
- [ ] Admin: `test/contract/handoff.test.ts` exists and passes; `clientIntegration.test.ts` includes a comms round-trip; `comms.spec.ts` asserts the draft PII rule
- [ ] `npm run test:coverage` and `npm run admin:test:coverage` pass with the new glob thresholds
- [ ] `grep -n "Buffer.from(encodeURIComponent" test/e2e-astro/cart-ux.spec.ts` may remain only if the test comment states the forged-payload case is the decoder test and the new producer test exists alongside
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- A new test exposes a real defect (report with the failing assertion — do
  not fix production code here).
- Moving `encodeCart`/`decodeCart` breaks an import you did not expect
  (report the importer; keep them in place and test through a thin export
  instead).
- Clipboard e2e is flaky in 3 runs (use the in-page stub mode and document).
- `npm run test:coverage` reveals the chosen floors fail on an unrelated
  module (fix scope: set the threshold key precisely to the new file).
- A `declared` command fails on the unmodified checkout (Step 0).

## Maintenance notes

- Glob thresholds are a ratchet: whenever one of these modules grows, raise
  the floor in the same PR that keeps it green.
- Reviewer: confirm no test-local reimplementation of production logic
  remains in the touched specs.
- **Deferred:** global floor raises (revisit when aggregate coverage moves
  as a whole); CommsPage component-level harness (plan 240 may add it).
