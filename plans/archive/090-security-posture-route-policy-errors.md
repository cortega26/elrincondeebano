# Plan 090: Security posture — route policy completa, error envelope, contención de paths

> Auditoría 8 (2026-08-11). Findings 12, 13, 19 (+ hardening SEC-01, refutado empíricamente).

## Status

- **Priority**: P1
- **Effort**: S-M
- **Risk**: LOW — cambios declarativos + mapeo de errores; e2e asertan mensajes (revisar)
- **Depends on**: —
- **Category**: security
- **Written against**: commit `cefdd9f`
- **Executed**: DONE — 2026-08-11 (verification abajo)

## Why this matters

La seguridad de 9 rutas mutantes descansa en el default fail-closed de
`routePolicy.ts` en lugar del manifest explícito que el propio archivo promete
("Every registered route … must appear here") — el test de contrato no las
cubre y un refactor puede dejarlas sin auth. Además las respuestas API
filtran paths absolutos del operador, y la contención de media usa
`startsWith` (prefix, no segmento). El traversal del static handler fue
refutado empíricamente (Fastify normaliza `%2e%2e`; 8 variantes → 404/SPA),
pero se endurece igual como última línea de defensa.

## Current state

- `src/server/security/routePolicy.ts:14-93` — tabla sin: `POST /media/intents/:id/run|apply|cancel` (media.ts:238/304/364), `POST /git/pull` (publication.ts:56), `GET /jobs/:id`, `POST /jobs/:id/cancel` (publication.ts:246/268), `POST /sync/pause|resume` (conflicts.ts:255/260), `POST /backup/prune-preview|prune|reconcile` (backup.ts:44/48/69). `POST /api/v1/diff` (changes.ts:719) clasificado `mutation` siendo read-only.
- `routePolicy.ts:123` — fallback `method === 'GET' ? read : mutation`.
- Respuestas con `(err as Error).message`: `storefront.ts:55,101`, `changes.ts:569-571,713-715,779-781`, `media.ts:158-160`, `conflicts.ts:249-251`, `backup.ts:125-127` — contienen `Cannot read product data from /home/carlos/...`.
- `media.ts:198,385,392` — `startsWith(intents.stagingRoot)` / `startsWith(resolve(repoRoot,'assets'))`.
- `app.ts:298-349` — handler estático sin check de contención post-`resolve` (refutado: Fastify normaliza antes; hardening defensivo).

## Scope

**In scope**: `routePolicy.ts`, rutas listadas, `client.ts` (mapeo de errores), `media.ts` (segment checks), `app.ts` (containment), tests.
**Out of scope**: authN del credential (ya ok), CSRF/Host allowlist (ya ok), secrets.

## Steps

### Step 1: Completar ROUTE_POLICY

Agregar las 9 rutas faltantes como `mutation` (y `/jobs/:id` GET como `read`). Reclasificar `POST /api/v1/diff` como read-only (clasificación `read` o exención documentada) — NO debe exigir write-mode ni credential de escritura para un diff.

**Verificar**: `test/contract/routePolicy.test.ts` — extender para que enumere las rutas registradas por `createApp` (inyectar `app.printRoutes()`) y aserte que toda ruta no-`/api/` GET/static esté en la tabla o exenta explícitamente. El test debe FALLAR si una ruta mutante nueva no se declara.

### Step 2: Error envelope sin paths internos

- Mapear errores en un solo punto: en `app.ts` un `setErrorHandler` que convierta `AppError`/errores conocidos a `{ error: { code, message } }` y para el resto devuelva `INTERNAL_ERROR` con mensaje genérico ("Internal server error"), logueando el detalle server-side (el auditLogger ya existe).
- Reemplazar los `catch` que devuelven `err.message` por lanzar errores tipados o dejar que el handler central los capture. El repositorio debe NO incluir paths en mensajes user-visible (o redactarlos).
- `client.ts:156-161` — mapear `INTERNAL_ERROR` y `BAD_REQUEST` correctamente.

**Verificar**: tests de los endpoints listados con error inducido → body sin `home/` ni `/home/`; `client.ts` distingue `INTERNAL_ERROR`. Revisar e2e que asertan mensajes exactos (playwright.config.ts) y ajustar solo si la aserción dependía del path.

### Step 3: Contención por segmento (media + static)

- `media.ts:198,385,392`: reemplazar `startsWith` por `path.relative(root, candidate)` y rechazar si el relativo empieza con `..` o es absoluto. Extraer helper `isContainedWithin(root, candidate)` en `src/shared/identity.ts` (junto a `isSafeId`).
- `app.ts` static handler: tras cada `resolve`, verificar `isContainedWithin(webDist|repoRoot, filePath)`; si falla → 404 (nunca 200 con contenido). Agregar al `assetServing.test.ts` casos `..`/`%2e%2e` que hoy devuelven 404/SPA y deben seguir sin servir archivos externos.

**Verificar**: `test/contract/pathSafety.test.ts` (o mediaSecurity) — casos prefix-colisión (`data/.media-staging2/`) rechazados; test estático con variantes de traversal.

### Step 4: Suite

```bash
npm run admin:test && npm run admin:certify
```

## Test plan

- `test/contract/routePolicy.test.ts`: contrato de registro completo.
- `test/integration/securityHeaders.test.ts` + `writeBoundary.test.ts`: sin regresión en auth.
- `pathSafety.test.ts`/`mediaSecurity.test.ts`: segment containment + traversal estático.
- Nuevos casos de error-envelope en `api.test.ts`.

## Done criteria

- [x] Rutas faltantes en ROUTE_POLICY (change-sets apply/undo/redo + GET :id, media run/apply/cancel, git/pull, sync pause/resume, backup prune/preview/reconcile, export.csv, diagnostics) + stale removidas (media/convert, media/generate) + contrato bidireccional (declaradas ↔ tabla, sin fallback).
- [x] `/diff` reclasificado read (sin credential de escritura).
- [x] Error envelope central (setErrorHandler): HttpError → code/mensaje público; internals → 500 genérico + log; 11 sitios que filtraban `err.message` convertidos; `sanitizeUserMessage` redacta paths/tokens; test de no-fuga.
- [x] Contención por segmento (`isContainedWithin`, sin node:path para el bundle web) en media (6 sites) y static handler + rechazo de `..` decodificado; tests unitarios y de traversal.

## Evidence (2026-08-11)

- `routePolicy.ts`: 76 rutas declaradas cubiertas exactamente (contrato bidireccional en `routePolicy.test.ts` — enumeración de `src/server/routes/*.ts` vs tabla, ambos sentidos).
- `app.ts`: `setErrorHandler` central (HttpError → público; 4xx Fastify → NOT_FOUND; ≥500 → genérico + `console.error` con details); rechazo de segmentos `..` en el path decodificado antes de resolver (defensa en profundidad — el router ya normaliza; verificado con inject que el 200 es SPA fallback, nunca el archivo externo).
- `AppError.ts`: `HttpError` + `sanitizeUserMessage`; 11 sitios convertidos (500 → HttpError genérico con details; 400 → mensaje sanitizado).
- `identity.ts`: `isContainedWithin` por segmentos (rechaza siblings `data/.media-staging2` y escapes); media.ts aplicado en creation/apply/discard (6 sites).
- Tests: +8 — contrato bidireccional de rutas, diff-read, phantom previews, sanitizer unit, no-fuga de paths en 500, containment unit, traversal static (nunca sirve archivos externos). Suite: 493 tests, e2e 19/19 + media 2/2, certify 30/30, lint 0 errores.

## STOP conditions

- Si `app.printRoutes()` no cubre rutas declaradas con fastify-static o catch-all, documentar la excepción en el test (lista explícita) en vez de debilitar la aserción.
- Si el mapeo central de errores cambia el contrato que e2e asertan en cadena (mensajes en UI), coordinar los ajustes de specs en el mismo commit.

## Maintenance notes

El contrato "toda ruta mutante debe declararse" evita que la próxima ruta nueva nazca sin auth. El error envelope central es el único lugar donde se formatea `{error:{code,message}}`; las rutas no deben construir bodies de error a mano.
