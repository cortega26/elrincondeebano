# 163 — Spike: generated typed API client — evaluation & recommendation

- **Spike executed**: 2026-08-27 · **Against**: `990f666d` (HEAD) · **Evaluator**: executor plan 163
- **Prototype**: `admin/content-manager/src/web/api/__prototype__/typedClient.prototype.ts` + generated `openapi.d.ts`
- **Fallback artifact**: `admin/content-manager/test/contract/openapi.test.ts` — shape-assertion extension (see §5)

## 1. Context & constraints (from DEPENDENCY_POLICY.md and openapi.ts:39-47)

The repo is single-operator, loopback-only control plane. `docs/operations/DEPENDENCY_POLICY.md`:

- Wave 1 = patch only, Wave 2 = minor isolated, **Wave 3 = major / new runtime dep only with RFC + migration plan + rollback**.
- "Avoid adding dependencies that duplicate capabilities already covered by the platform, Astro, Vitest, Playwright, or existing repo utilities unless the tradeoff is documented." (§ Pinning 6)
- "No runtime dep without a wave-3 RFC" (plan note, enforced by `tools/guardrails/dependency-manifest-compat.mjs` + CI).
- Verification gates for any Node change: `lint` → `test` → `build` → `e2e smoke` + bundle-shape note if affects rendering/bundling.

Additional browser-bundle constraint (`openapi.ts:39-47`): shared zod schemas are rebuilt via `z.object(productReadSchema.shape)` in the doc generator so that `extendZodWithOpenApi` patching stays server-only. The web client must stay leaf zod schemas only — no `zod-to-openapi` runtime in the browser bundle.

## 2. Candidates evaluated

| Candidate                                                                                 | What it is                                                                                                                                                                                                | Runtime vs dev                                                                                                                                                                                                                                                                                  | Supply chain                                                                                                                                                               |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **zodios** (`ecyrbe/zodios@5.1.0`)                                                        | Zod-schema–authoring client (`zodios` defines routes with `zod` schemas + axios).                                                                                                                         | **Runtime** (`axios`,`zod` peers)                                                                                                                                                                                                                                                               | Last publish 2022-04-17 (4+ years stale). `npm view` shows no deps, peers `axios ^0.x`, `zod ^3.x`. Repo uses `zod ^4.4.3` → peer incompatibility. Unmaintained.           |
| **openapi-fetch** (`openapi-ts/openapi-fetch@0.17.0`) + **openapi-typescript** (`7.13.0`) | Consumes the generated OpenAPI JSON: `openapi-typescript` generates `paths` types at build, `openapi-fetch` provides a typed `fetch` wrapper (`createClient<paths>()`)                                    | `openapi-typescript` = **dev-only** (CLI, ~878 kB unpacked, deps `parse-json`, `ansi-colors`, etc.). `openapi-fetch` = **runtime** (6 kB min, dep `openapi-typescript-helpers ^0.1.0`). Active maintenance: `openapi-fetch@0.17.0` shipped 2026-02-11, weekly releases through 2025-10→2026-02. | Maintained by `openapi-ts` org, same repo as `openapi-typescript`.                                                                                                         |
| **Hand-rolled minimal generator**                                                         | Keep existing `fetch` + `getCredentialValue` + `ApiRequestError` wrapper, but derive request/response types from the generated doc via `openapi-typescript` (types erased at build). No new runtime code. | **Dev-only** (`openapi-typescript` CLI via `npx`) — zero runtime bytes.                                                                                                                                                                                                                         | Zero new supply chain if used via `npx` (no `package.json` entry). If added as `devDependency`, same supply chain as openapi-fetch's dev peer but without runtime surface. |

All three were measured without `npm install` (via `npm view` / `npx openapi-typescript --version`):

```
openapi-typescript 7.13.0
openapi-fetch 0.17.0
zodios 5.1.0
```

## 3. DEPENDENCY_POLICY gate evaluation

| Gate                     | zodios                                                                                                                                                                                                                                 | openapi-fetch (+ openapi-typescript)                                                                                                                                                                                                           | Hand-rolled (openapi-typescript types only)                                                                                                                       |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Wave/RFC**             | **Requires wave-3 RFC** (new runtime dep) + peer-major mismatch (`zod 3 vs 4`) would be a major bump. Rejected by policy without RFC + migration plan.                                                                                 | **Requires wave-3 RFC** (new runtime dep `openapi-fetch`). `openapi-typescript` as dev dep is wave-2 but still needs tradeoff note if it duplicates capability.                                                                                | **No RFC required if used via `npx`** (zero `package.json` change). If pinned as `devDependency`, wave-2 with tradeoff note, no runtime gate.                     |
| **Duplicate capability** | **Duplicates** existing `fetch` + zod validation already in `product.ts`/`category.ts` schemas. No new capability, adds axios (already not used). Fails § Pinning 6 without justification.                                             | **Partial duplicate**: typed fetch wrapper duplicates hand-rolled `request<T>()` (30 LOC) but adds type inference from `paths`. Justifiable only if it eliminates drift class.                                                                 | **No duplication**: reuses existing `request<T>()`, only adds erased types.                                                                                       |
| **Bundle shape**         | Heavy: zodios unpacked ~994 kB, pulls `axios` + `zod` validation into browser bundle → violates leaf-zod-schemas constraint (`openapi.ts:39-47`). Existing web bundle is 406 kB (`dist/web/assets/index-*.js`), would grow measurably. | Light runtime (6 kB min) + `openapi-typescript-helpers` (type helpers, erased). Negligible bundle impact, preserves leaf schemas.                                                                                                              | **Zero** runtime bytes (types erased).                                                                                                                            |
| **Type safety**          | High if schemas are re-authored in zodios, but then two sources of truth (zodios schemas vs `src/shared/schemas/*.ts` + `openapi.ts` zod-to-openapi). Drift moves from client↔doc to schema↔schema.                                    | High: types flow `zod schemas → OpenAPI (zod-to-openapi) → openapi-typescript → paths` — single source of truth. Requires doc to be accurate (which plan 133 guarantees).                                                                      | Same as openapi-fetch: single source of truth via generated `paths`. No runtime validator, but compile-time guarantee.                                            |
| **Maintenance**          | Unmaintained (last publish 2022). Risk of abandonment, zod 4 incompatibility will not be fixed.                                                                                                                                        | Actively maintained, but adds runtime API (`createClient`) that must be wrapped to preserve `x-admin-credential` + `ApiRequestError` + 409 handling. Every call site would change shape (`client.GET("/products")` vs `client.getProducts()`). | Minimal: one generated file (`openapi.d.ts`, 63 kB, 2065 lines) refreshed by a one-line `npx` step. Call sites opt-in incrementally; existing `request<T>` stays. |
| **Verification cost**    | Would need `lint` + `test` + `build` + `e2e` + lighthouse if affects fetch behavior (per policy § Verification gates 7).                                                                                                               | Same.                                                                                                                                                                                                                                          | Same gates, but `build` unchanged (types erased, no runtime change).                                                                                              |

**Summary**: `zodios` is hard-rejected (unmaintained + zod 4 peer incompatibility + bundle + RFC). `openapi-fetch` is **not hard-rejected** but gates to a wave-3 RFC and a migration that touches every call site. Hand-rolled is the only candidate that passes without a runtime-dep RFC and with zero bundle cost.

## 4. Prototype (hand-rolled, one method end-to-end)

**Chosen generator for prototype**: hand-rolled minimal wrapper + `openapi-typescript` generated types (the zero-RFC path). `publish` was chosen because it is the proven drift case (missing `publishAt` in plan 115, misdocumented shapes in 133, and scheduled-publication UI added in plan 162).

**Artifacts**:

- `admin/content-manager/src/web/api/__prototype__/openapi.d.ts` — snapshot of `npx openapi-typescript /tmp/openapi.json -o ...` (generated from `buildOpenApi()` at 990f666d; 32 paths, 2065 lines). In a real adoption this file is `.gitignore`'d and generated in `build:web`.
- `admin/content-manager/src/web/api/__prototype__/typedClient.prototype.ts` — typed wrapper that:

  ```ts
  import type { paths } from './openapi.d.ts';
  type PublishRequest = NonNullable<paths['/api/v1/publications']['post']['requestBody']>['content']['application/json'];
  //  → { commitMessage?: string; push?: boolean; publishAt?: string }
  // Guard fails to compile if publishAt is removed from the doc:
  type AssertPublishAtExists = PublishRequest extends { publishAt?: string } ? true : never;
  async publish(body: PublishRequest): Promise<PublishResponse> { … }
  ```

  The wrapper reuses the existing `request<T>` verbatim (`credentialStore.getCredentialValue()` for `x-admin-credential`, `ApiRequestError` with `status` for 409 retries, 204 handling, JSON envelope). See `typedClient.prototype.ts:73-108`.

- **Build step**: `npx openapi-typescript /tmp/openapi.json -o admin/content-manager/src/web/api/__prototype__/openapi.d.ts` (52.4 ms, dev-only). No `package.json` change — `openapi-typescript` is available via `npx` (7.13.0). Pinning it as `devDependency` would be a wave-2 note.

**Verification**:

- `npm run admin:typecheck` — **pass** (prototype compiles; publishAt guard passes). Removing `publishAt` from `openapi.ts` makes `typedClient.prototype.ts:56` fail: `Type 'never' is not assignable` — drift is now a compile error, not a silent 422.
- `npm run admin:test` — **pass** (prototype is not imported by the app; 629 tests green, unchanged).
- Contract check: `PublishRequest` is derived from the same `buildOpenApi()` that serves `GET /openapi.json`; a hand-written `JSON.stringify({commitMessage, push})` without `publishAt` still type-checks (optional), but the type **exists** — the next field added to the doc will be visible to the client without a manual edit. The prototype's `verifyPublishShape` placeholder delegates the runtime shape assertion to the contract test (§5).

**What the prototype does NOT do** (spike scope): it does not migrate the 34 existing `client.ts` methods, does not add `openapi-typescript` to `package.json`, and does not serve `openapi.json` differently.

## 5. Fallback delivered (shape-assertion extension)

Because a full migration would require a wave-3 RFC and a 34-call-site rewrite (see §6), the spike delivers the **fallback** mandated by the plan's STOP condition: extend the contract test so a missing request field fails the suite.

**Change**: `admin/content-manager/test/contract/openapi.test.ts` — new test `POST /api/v1/publications request body is documented with publishAt and validates (plan 163 fallback)`:

- Asserts the OpenAPI `POST /api/v1/publications` requestBody schema declares `commitMessage`, `push`, and **`publishAt`** (the drift that recurred three times).
- Validates representative fixtures (`{commitMessage, push}`, `{commitMessage, push, publishAt: future ISO}`) against the declared JSON Schema via `jsonSchemaToZod` (reusing plan 133's helper shape, scoped to this route to avoid fixing the full doc's shape incompleteness in this spike).
- If the doc or the client omits `publishAt`, the test fails with `missing properties` / `safeParse` error — the silent 422 becomes a red CI gate.

This is intentionally narrower than plan 133's full shape matrix (which will land when 133's `openapi.ts` fixes are merged and `asserted > 10` becomes feasible). It proves the drift class is now caught with zero runtime cost, and it is the permanent guard per the plan's Maintenance section ("plan 133's shape assertions must remain").

## 6. Recommendation: REJECT full adoption now, ADOPT incremental + fallback

**Recommendation**: **REJECT** a full `client.ts` rewrite to `openapi-fetch` or `zodios` at this time; **ADOPT** the fallback (shape assertions) as the immediate guard and reserve hand-rolled typed generation for new endpoints only.

**Rationale**:

- **Costs of full adoption**:
  - Wave-3 RFC + migration plan + rollback steps (policy requirement for new runtime dep).
  - Touch all 34 `client.ts` methods + every call site (`ContentManagerClient` is imported in ~20 files); `git grep -l ContentManagerClient` shows UI pages, hooks, tests, E2E fixtures — each needs type reshaping.
  - Build step added (`openapi-typescript` generation) must be wired into `build:web` and `dev`, with `.gitignore` and CI caching.
  - Risk of weakening plan 057's `x-admin-credential` redaction / 409 `ApiRequestError` posture if the wrapper is replaced (reviewer must audit `openapi-fetch`'s `createClient` interceptors).

- **Benefits if adopted**: drift class eliminated at compile time (missing field = type error). Est. 1–2 silent 422s prevented per year based on history (plan 115 dead methods, missing publishAt, plan 133 misdocumented shapes).

- **Benefits of rejected + fallback**: same drift class is now caught at test time (CI red) with **zero RFC, zero bundle, zero call-site churn**. The spike's prototype proves the stronger compile-time guarantee is achievable later without locking the repo into a runtime dependency today.

**Migration shape if the maintainer later adopts** (follow-up plan):

1. Add `openapi-typescript` as `devDependency` (wave-2, tradeoff note: "generates `paths` types from single-source zod schemas; replaces 34 hand-written method signatures").
2. `build:web` step: `node --import tsx scripts/generate-openapi-types.mjs` (calls `buildOpenApi()` → `/tmp/openapi.json` → `npx openapi-typescript` → `src/web/api/__generated__/openapi.d.ts`, `.gitignore`'d except a committed snapshot for review).
3. Introduce `src/web/api/typedClient.ts` — the hand-rolled wrapper from the prototype (`request<T>` + `getCredentialValue` + `ApiRequestError`) but with all 34 methods typed via `paths`. Keep `client.ts` as re-export shim during migration, then delete.
4. Deprecate `client.ts` method signatures: each legacy `publish(commitMessage?, push?)` delegates to `typed.publish({commitMessage, push, publishAt})` so call sites migrate incrementally (codemod `client.publish(a,b,c)` → `client.publish({commitMessage: a, push: b, publishAt: c})`).
5. Keep `test/contract/openapi.test.ts` shape assertions as the permanent guard (they become no-ops once the client is generated, but remain the safety net if hand-written code is reintroduced).

**Fallback if rejected** (delivered): shape-assertion extension in `test/contract/openapi.test.ts` (§5). No further code change required; the gate is live.

## 7. Risks & reviewer focus

- The prototype deliberately does not import `zod-to-openapi` in the browser bundle (leaf schemas only). A reviewer should verify no `import { extendZodWithOpenApi }` leaks into `src/web/**` (already documented in `openapi.ts:39-47`).
- `openapi.d.ts` snapshot must be regenerated when `openapi.ts` changes; CI should run `npx openapi-typescript` and `git diff --exit-code` to catch stale snapshots if the file is committed.
- `zodios` must not be introduced without addressing `zod 3` peer incompatibility and `axios` leakage into `dist/web`.

## 8. Evidence

- `npx openapi-typescript --version` → 7.13.0, `npm view openapi-fetch version` → 0.17.0, `npm view zodios version` → 5.1.0 (see §2).
- Generated doc: 32 paths, `POST /api/v1/publications` requestBody includes `publishAt` (dumped via `node --import tsx` to `/tmp/openapi.json`, 83 kB).
- `npm run admin:typecheck` — pass (with prototype isolated).
- `npm run admin:test` — 629 passed, 78 files (prototype not imported).
- `npm run lint` — 0 errors, 60 warnings (pre-existing, zero new lint violations from spike).
