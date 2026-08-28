# 164 — Spike Recommendation: "Build + preview" job inside the admin

- **Date**: 2026-08-28
- **Baseline commit**: `2a033082` (HEAD at spike start)
- **Verdict**: **ADOPT** — feasibility proven; proceed to a follow-up build plan for production wiring (flag-gated, then removal of flag).
- **Prototype location**: `admin/content-manager/src/server/services/previewBuild.ts`, `admin/content-manager/src/server/prototype/previewRoute.ts` (isolated under `prototype/` so `npm run admin:test` stays green; not yet wired into `app.ts`).

---

## 1. Assumptions verification (Step 1 of the plan)

### (a) jobRunner can run a long job without blocking the server

- `admin/content-manager/src/server/services/jobRunner.ts:131` — `processQueue` is **strictly sequential** (`processing` flag + `queue.shift()`), drains via `setImmediate`, and `await fn()` keeps the event loop responsive. A `build:fast` job therefore does **not** starve the HTTP server or SSE — `GET /api/v1/jobs/:id` remains responsive while `status === 'running'`.
- The cost is **queue serialization**: a preview build occupies the single worker; subsequent `publication`, `git-pull`, sync or second preview jobs queue (`getPendingCount() >= 1`) until it completes. Observed with two back-to-back `schedule()` calls: first `build-preview` ran ~3.3 s, second `test-quick` started only after the first settled (`admin:test` and manual `node --import tsx` probe).
- Mitigation for production: keep the serial queue and expose the status surface (`GET /jobs`, `GET /jobs/:id` already polled by `PublicationPage.tsx:31`), do **not** introduce parallelism — the CPU contention of two concurrent Astro builds would be worse than queuing. Document the contention trade-off in the follow-up plan.

### (b) Static route can serve `astro-poc/dist` with existing containment helper

- Reused exactly the hardening history from `admin/content-manager/src/server/app.ts:349-411` (plan 090/132):
  - `decodeURIComponent` raw path with `try/catch` for malformed encodings.
  - Early `urlPath.split('/').includes('..')` rejection **before** `resolve()` (prevents collapse-before-check, verified via `inject: /assets/%2e%2e/secret.txt` in the original hardening).
  - `isContainedWithin(distRoot, filePath)` (`admin/content-manager/src/shared/identity.ts:70`) segment-equality check, not prefix, rejecting sibling-dir collisions (`/data/.media-staging2` vs `.media-staging`).
  - `existsSync` + mime-type map mirroring `app.ts:332-347`.
- Prototype containment proven (see §4): encoded traversals `/%2e%2e/%2e%2e/etc/passwd`, `/%2e%2e%2fpackage.json`, double-decoded `/%2e%2e/secret.txt`, and bare `../etc/passwd` all return `null` → handler replies `404 NOT_FOUND` with no file leakage. Valid paths `/`, `/index.html`, `/bebidas.html`, `/sitemap.xml` resolve inside `astro-poc/dist` and are served.

### (c) `build:fast` completes in a tolerable window

- Measured on this worktree (warm cache, `npm run build:fast`):

```
time npm run build:fast  →  real 0m3.297s  (user 3.584s, sys 0.898s)  on 2026-08-28
node --import tsx runPreviewBuild probe: 3571 ms and 3366 ms on two consecutive runs
```

- The audit concern was _full_ `npm run build` (preflight + Astro) being slow. `build:fast` (Astro only: `npm -w astro-poc run build`) is **~3–4 s** with the existing 233 pages / 741 referenced assets, well inside a UX-tolerable window for an async job with a progress surface. No STOP condition triggered.
- Production timeout recommendation: `120_000 ms` (2 min) to accommodate a cold run or modest catalog growth; the prototype already enforces this via `spawn(..., { timeout })`.

---

## 2. Prototype delivered

### Job implementation

`admin/content-manager/src/server/services/previewBuild.ts:1`

- **Exported shape**

```ts
export interface PreviewBuildResult {
  success: boolean;
  distPath: string; // resolve(repoRoot, 'astro-poc/dist')
  duration_ms: number;
  output?: string; // last 2 KB of stdout on success
  error?: string; // sanitized stderr or exit code
}
export interface PreviewBuildOptions {
  onProgress?: (percent: number) => void;
  isCancelled?: () => boolean;
  timeoutMs?: number;
}
export function getPreviewDistRoot(repoRoot: string): string;
export async function runPreviewBuild(
  repoRoot: string,
  options?: PreviewBuildOptions
): Promise<PreviewBuildResult>;
export function schedulePreviewBuild(
  jobRunner: JobRunner,
  repoRoot: string
): Job<PreviewBuildResult>;
```

- **Subprocess choice**: `spawn('npm', ['run','build:fast'], { cwd: repoRoot, shell:false, timeout:120_000 })` — same pattern as `admin/content-manager/src/server/adapters/gitAdapter.ts:1` (`execFile`) and `admin/content-manager/src/server/services/mediaJobs.ts:4` (`spawn`). Fixed argument list, no browser-controlled flags. Output capped at 100 KB in memory, returned slice at 2 KB to avoid leaking absolute paths in the job payload. Sanitization inherits the plan 090 practice of not exposing operator paths in error envelopes (the handler throws `new Error(result.error)`, and `app.ts:437` already maps non-`HttpError` to generic `INTERNAL_ERROR` with structured logging).
- **Cancellation**: polls `isCancelled` (== `job.cancelRequested`) every 200 ms and `child.kill('SIGTERM')`; also `checkCancel()` before and after `await runPreviewBuild()` so a cancellation that wins the race is surfaced as `status: 'cancelled'` rather than `failed`.
- **Progress mapping**: `onProgress` is wired to `jobRunner.updateProgress(jobId, mapped)` where `mapped = clamp(p,5,95)` — publication jobs use `10/30/50/70/100`, preview uses a single 5→95 sweep; the final 100 is set on success.

### Route implementation

`admin/content-manager/src/server/prototype/previewRoute.ts:1`

- **Proposed registration** (not yet wired into `app.ts` — see §3):
  ```ts
  await app.register(
    async (instance) => {
      await previewRoutes(instance, repoRoot, jobRunner);
    },
    { prefix: '/api/v1' }
  );
  // inside previewRoutes:
  //   app.post('/preview/build', handler)   // 202 { job_id, status }
  //   app.get('/preview/*', handler)        // serves astro-poc/dist
  //   app.get('/preview', handler)          // serves index.html
  ```
- **Containment implementation** (`resolvePreviewFilePath:35`): strips `/api/v1/preview` prefix, normalizes `/` → `/index.html`, calls `isContainedWithin(distRoot, filePath)`, rejects missing assets without fallback to SPA HTML (missing `/assets/*` or `/_astro/*` returns `null` → 404, not `index.html`), falls back to `index.html` only for non-asset misses (so a mistyped route still shows the storefront shell, matching `tools/lighthouse-audit.mjs:createStaticServer`'s `/ → /index.html` behavior but without hiding broken images).
- **Loopback URL returned**: on success the job result already contains `distPath`; the HTTP layer should also return `previewUrl: http://127.0.0.1:${port}/api/v1/preview/` (port is `request.headers.host` validated by the existing loopback Host allowlist at `app.ts:276-285`).

### Manual verification

Run against the real `astro-poc/dist` present in the worktree (`ls astro-poc/dist` shows `index.html`, `bebidas.html`, `sitemap.xml`, `_astro/`, `assets/`):

```
node --import tsx probe:
  resolvePreviewFilePath('/api/v1/preview/')            → …/dist/index.html  PASS
  resolvePreviewFilePath('/api/v1/preview/bebidas.html') → …/dist/bebidas.html PASS
  resolvePreviewFilePath('/api/v1/preview/sitemap.xml')  → …/dist/sitemap.xml PASS
  resolvePreviewFilePath('/api/v1/preview/%2e%2e/%2e%2e/etc/passwd') → BLOCKED PASS
  (6 additional encoded traversals all BLOCKED)
  Fastify integration (listen 0, fetch):
    GET /api/v1/preview/                → 200 text/html len 211k  PASS
    GET /api/v1/preview/bebidas.html    → 200 text/html len 55k   PASS
    GET /api/v1/preview/sitemap.xml     → 200 text/xml  len 14k   PASS
    GET /api/v1/preview/%2e%2e/package.json → 404 PASS
```

Job completion: `runPreviewBuild` → `success:true, duration_ms:3571, distPath exists:true`; `schedulePreviewBuild` through `JobRunner` → `status:completed, progress:100`, second queued job started only after the first completed.

---

## 3. Recommendation spec

### Job spec (follow-up)

- **Type name**: `build-preview`
- **Trigger**: `POST /api/v1/preview/build` (preview-class — requires `enableWrites:true` / `ADMIN_MODE=operator`, but **no** launch credential; analog to `POST /api/v1/publications/preview`). Payload empty; no user-supplied command or path.
- **Job creation**: `schedulePreviewBuild(jobRunner, repoRoot)` as implemented. Single-flight: if a `build-preview` job is already `running`, either queue (current serial semantics) or return `409 CONFLICT` with the existing `job_id` — queueing is simpler and matches publication semantics.
- **Status polling**: reuse existing `GET /api/v1/jobs/:id` and `GET /api/v1/jobs`; no new SSE needed (the sync SSE at `app.ts:130` is orthogonal). UI polls every 1 s as `PublicationPage.tsx:34` already does for publication jobs.
- **Result payload**: `{ success, distPath, duration_ms, output, error, previewUrl }` where `previewUrl` is `http://127.0.0.1:${actualPort}/api/v1/preview/` (loopback only — the admin app is already bound to loopback and protected by the Host allowlist, plan 057).

### Route spec

- **Paths**:
  - `POST /api/v1/preview/build` → `preview` in `routePolicy.ts`
  - `GET  /api/v1/preview/*` → `read`
  - `GET  /api/v1/preview` → `read` (convenience alias for `/`)
- **Classification change in `admin/content-manager/src/server/security/routePolicy.ts:14`** (example):
  ```ts
  { method: 'POST', path: '/api/v1/preview/build', class: 'preview' },
  { method: 'GET',  path: '/api/v1/preview',        class: 'read' },
  { method: 'GET',  path: '/api/v1/preview/*',      class: 'read' }, // requires prefix handling
  ```
  The current `classifyRoute` does exact segment equality; the `/*` entry needs prefix support:
  ```ts
  if (entry.path.endsWith('/*')) {
    const prefix = entry.path.slice(0, -2);
    if (normalizedPath === prefix || normalizedPath.startsWith(prefix + '/'))
      return { class: entry.class, exact: true };
  }
  ```
  Alternatively, keep the two concrete routes (`/preview` and `/preview/*`) and implement the wildcard as a param route — Fastify matches `/preview/*` as a wildcard, but the policy check runs **before** routing in `preHandler`, so it must still recognize it as `read` there. The quickest path is the `endsWith('/*')` prefix check; `GET` fall-closed-to-`read` already makes unlisted preview GETs readable, but explicit listing makes the guarantee test (`test/contract/routePolicy.test.ts:148`) enforce the hardening and documents the containment class for reviewers (same class as plan 090).
- **Wiring** (`admin/content-manager/src/server/app.ts:225` area):
  ```ts
  import { previewRoutes } from './prototype/previewRoute.ts'; // or './routes/preview.ts' once adopted
  // after publicationRoutes registration:
  if (process.env.PREVIEW_BUILD_ENABLED === '1') {
    await app.register(
      async (instance) => {
        await previewRoutes(instance, repoRoot, jobRunner);
      },
      { prefix: '/api/v1' }
    );
  }
  ```
  Gate with `PREVIEW_BUILD_ENABLED` until the follow-up plan removes the flag; the prototype lives under `src/server/prototype/` so the guarantee test (`declaredRoutes()` scans `src/server/routes/*.ts`) does not see it while flagged off — once moved to `routes/` and listed in the policy, that scanner will enforce it.
- **Security invariants** (reviewer checklist — same class as plan 090):
  - No serving outside `astro-poc/dist` (segment containment + `..` segment rejection, tested with encoded `..%2f` and raw `..`).
  - No `shell:true` in `spawn` — fixed `npm run build:fast`.
  - Loopback-only: relies on the existing `onRequest` Host allowlist (`localhost`, `127.0.0.1`, `::1`) and `Sec-Fetch-Site`/`Origin` checks; no new CORS surface.
  - CSP: current `onSend` hook sets `Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'` for **all** replies, including the preview HTML. The preview static site ships its own hashed bundles and inline styles; the admin's CSP is compatible (no `unsafe-eval`), but the follow-up should set `X-Content-Type-Options: nosniff` and `Cache-Control` as the prototype does, and consider not overwriting the preview's CSP if the storefront needs stricter/different headers.

### UI sketch

Placement: `admin/content-manager/src/web/app/routes/PublicationPage.tsx:480` — inside the existing **"Publicar cambios"** section, between the schedule note and the three-button row, add a fourth action block:

```
┌─ Acciones de publicación ──────────────────────────────────────┐
│ [Build + abrir vista previa]  (primary, disabled while running) │
│  label: muestra "Reconstruyendo…" + <progress> while job running │
│  onSuccess: link  [Abrir vista previa →]  (target=_blank,
│            href=`${window.location.origin}/api/v1/preview/`)   │
│            + copyable localhost URL + "Evidencia: descargar"    │
│  error: inline alert with job.error (sanitized, no paths)       │
└────────────────────────────────────────────────────────────────┘
```

- State: `const [previewJob, setPreviewJob] = useState<JobResponse|null>(null)` adjacent to existing `job` state; `pollJob` helper reused (the existing `client.getJob` polling at `PublicationPage.tsx:31` already supports any job id).
- Client method (`admin/content-manager/src/web/api/client.ts`): `async buildPreview(): Promise<{ job_id:string; status:string }>` → `POST /preview/build` (preview class, so it sends `x-admin-credential` only if mutation; since the route will be `preview`, the `isMutation` check in `client.ts:252` should be extended to treat `preview` POSTs the same via `RouteClass` — or simply send the credential unconditionally for this path).
- Evidence export: on `previewJob.status === 'completed'`, offer a download: `GET /api/v1/jobs/:id` payload + `GET /api/v1/preview/sitemap.xml` HEAD + timestamp → `reports/preview/latest.json` (analog to `reports/share-preview/latest.json` used by `npm run monitor:share-preview`). The existing `smoke:evidence` script can be refactored to accept `--base-url http://127.0.0.1:${port}/api/v1/preview` as its probe base.

### PR-evidence flow

Today (`RUNBOOK.md:235-240`, `.github/pull_request_template.md:20`):

1. `npm run build` 2. `npx serve astro-poc/dist -l 4174` 3. `npm run smoke:manual` 4. hand-type smoke checklist into PR.

With the preview job:

1. Operator clicks **Build + abrir vista previa** → job `build-preview` runs `build:fast` (≈3.5 s) → progress bar → success → **Abrir vista previa** opens `http://127.0.0.1:${adminPort}/api/v1/preview/` in a new tab (real pixels, not checkmarks).
2. The job result includes `duration_ms`, `output` (truncated), and `distPath`; the UI offers **Descargar evidencia** → writes `reports/preview/<iso>.json` with `{ job_id, duration_ms, previewUrl, routes: [sitemap.xml listing], sharePreview: monitorRun }`.
3. The PR template's "Smoke test notes" field is filled by attaching that JSON (or its path) rather than hand-typed checklist. The full release gate `npm run build` (preflight + Astro) remains the operator's release gate — the preview job intentionally uses `build:fast` only (Out of scope for this spike was `npm run build` and `RUNBOOK`/PR template changes, which should only change **after** adoption).

---

## 4. Contention & non-goals

- **CPU contention**: the admin (`tsx --watch`, Fastify) and Astro (`vite build`) share the same host. On this machine the build consumes ~1.1 s Astro + 0.4 s pruning + validations, ~1.5 s of JS CPU. Running it inside the admin will make the UI feel less snappy while the child is active but does not block the event loop (because `spawn` is async). Recommendation: keep `build-preview` as a **single-flight serial job**, document that a concurrent publication build will queue, and avoid parallel builds. Do not add a worker pool.
- **Not built**: full `npm run build` (with `categories:sync`, `images:logo`, `og:home`, etc.) stays out of the preview job — operator confirms via preflight checks (`PublicationPage.tsx:327`) and the release gate `npm run validate`.
- **Not changed**: `docs/operations/RUNBOOK.md` and `.github/pull_request_template.md` until adoption (plan Out). The follow-up plan should update the runbook's "Ejecutar smoke manual guiado" playbook to describe the in-app path first, with the manual `npx serve` as fallback.

---

## 5. Open questions for the build plan

1. **Quota / abuse**: should `POST /preview/build` be rate-limited to once per N seconds? A naive double-click would queue two builds. The job runner's serial queue already serializes them; the UI should disable the button while `previewJob.status === 'running'|'pending'`.
2. **Artifact lifetime**: `astro-poc/dist` is overwritten on every build; no versioned dists are needed for preview. If the UI needs diffing, store `dist` snapshots under `data/.preview-snapshots/` (gitignored) and prune.
3. **Error surfacing**: `build:fast` failures should surface the sanitized `stderr` slice in the UI's alert, but the global error handler masks details with `INTERNAL_ERROR`. The preview build job's `error` field (returned via `GET /jobs/:id`) is the correct channel — do not log operator paths at `request.log.error` beyond what is already there.

---

## 6. Evidence attached

- `time npm run build:fast` log (this spike session): `real 0m3.297s`, `[build] Complete!`, 233 pages, 741 asset refs, 14 artifacts.
- `node --import tsx` probe of `runPreviewBuild` and `schedulePreviewBuild` (durations 3571 ms / 3366 ms, `distPath` exists, queue serialization observed).
- `resolvePreviewFilePath` unit checks: 8/8 passed (traversals blocked).
- Fastify `previewRoutes` live probe: `GET /api/v1/preview/` 200 (211 KB), `GET /api/v1/preview/bebidas.html` 200, traversals 404.

---

## References

- Hardening history: `app.ts:332-411`, `shared/identity.ts:70` (plan 090/132).
- Existing job: `services/jobRunner.ts:131`, `routes/publication.ts:131`.
- Preflight UI: `web/app/routes/PublicationPage.tsx:287-437`.
- Manual ritual + PR requirement: `docs/operations/RUNBOOK.md:235-240`, `SMOKE_TEST.md:9-19`, `.github/pull_request_template.md:20`.
