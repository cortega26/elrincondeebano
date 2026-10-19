# Plan 257: Dev-server del admin — el proxy `/api` se traga los módulos del SPA

> **Executor instructions**: Sigue este plan paso a paso. Ejecuta cada
> comando de verificación y confirma el resultado esperado antes de pasar
> al siguiente paso. Si ocurre algo en la sección "STOP conditions",
> detente y reporta — no improvises. Al terminar, actualiza la fila de
> estado de este plan en `plans/README.md` — salvo que un reviewer te haya
> despachado y te haya dicho que mantiene el índice.
>
> **Drift check (run first)**: `git diff --stat 9f5558d0..HEAD -- admin/content-manager/vite.config.ts docs/operations/DEFERRALS.md`

## Status

- **Priority**: P3
- **Effort**: XS
- **Risk**: LOW
- **Depends on**: 241 (finding), 248 (landed)
- **Category**: dx / bug
- **Planned at**: commit `9f5558d0`, 2026-10-19

## Why this matters

Hallazgo preexistente del plan 241 (fila 17 del registro): el dev server
del admin **no puede arrancar el SPA**. La raíz de Vite es `src/web`, así
que `src/web/api/client.ts` se sirve como `/api/client.ts`; el proxy de
desarrollo matchea `'/api'` y manda ese módulo a Fastify → 404 con
`x-request-id`. Todas las rutas de la API viven bajo `/api/v1`, así que
estrechar el proxy a `'/api/v1'` es el fix correcto y de una línea.

## Current state

- `admin/content-manager/vite.config.ts` — proxy:
  `'/api': { target: 'http://127.0.0.1:3000', changeOrigin: true }`.
- Rutas del servidor registradas con prefijo `/api/v1`
  (`src/server/routes/registerRoutes.ts:81,83,89`); health es
  `GET /api/v1/health` (`src/server/routes/health.ts:4`).
- El cliente web solo llama `/api/v1/...` (paths del doc generado).
- Evidencia del 241: `GET http://127.0.0.1:5173/api/client.ts` → Fastify
  404 + `x-request-id`; el SPA falla al bootear (los módulos bajo
  `src/web/api/` no se sirven).

## Commands you will need

| Purpose     | Command                                                            | Provenance | Expected on success |
| ----------- | ------------------------------------------------------------------ | ---------- | ------------------- |
| Install     | `HUSKY=0 npm ci`                                                   | declared   | exit 0              |
| API server  | `npm run start` (workspace `admin/content-manager`, puerto 3000)   | declared   | escucha en 3000     |
| Vite dev    | `npm run dev:web` (workspace `admin/content-manager`, puerto 5173) | declared   | escucha en 5173     |
| Build       | `npm run admin:build` (raíz)                                       | declared   | exit 0              |
| Admin tests | `npm run admin:test`                                               | declared   | all pass            |
| Typecheck   | `npm run admin:typecheck`                                          | declared   | exit 0              |
| Lint        | `npm run admin:lint`                                               | declared   | 0 errors            |

## Scope

**In scope**:

- `admin/content-manager/vite.config.ts` (clave del proxy).
- `docs/operations/DEFERRALS.md` (mover la fila 17 a Resolved).

**Out of scope**:

- Servidor, cliente, configs de Playwright, puertos.

## Git workflow

- Branch: `advisor/257-vite-dev-proxy`
- Commits: `fix(admin): narrow the dev proxy to /api/v1 so SPA modules serve (plan 257)`
  y `docs(ops): resolve the dev-server register row (plan 257)`.
- No push, no PR.

## Steps

### Step 0: Baseline

Instala; `npm run admin:build` + `npm run admin:test` verdes.

### Step 1: Reproducir el fallo (antes del fix)

Levanta el API server y Vite dev. Verifica:

- `curl -i http://127.0.0.1:5173/api/client.ts` → 404 con `x-request-id`
  (Fastify), no el módulo.
- Smoke de navegador (script throwaway en `/tmp/opencode` con Playwright):
  `goto http://127.0.0.1:5173` → el SPA **no** bootea; registra los
  errores de consola/requests fallidos.
  Apaga ambos servidores antes del fix (o deja que Vite recargue la config).

### Step 2: Fix

Cambia la clave del proxy `'/api'` → `'/api/v1'` (mismos target y
`changeOrigin`).

### Step 3: Verificar post-fix

Reinicia Vite si hace falta. Verifica:

- `curl -i http://127.0.0.1:5173/api/client.ts` → **200**, JS
  (`Content-Type: application/javascript` o similar de Vite).
- `curl -i http://127.0.0.1:5173/api/v1/health` → proxied a Fastify,
  **200** JSON (loopback exento del gate de credencial; si devuelve otro
  código documentado, repórtalo con el body).
- Smoke de navegador: el SPA renderiza (nav/página inicial), **cero**
  requests de módulos fallidos, cero errores de consola.
- Registra evidencia antes/después.

**Verify**: los tres puntos, con la salida pegada en el reporte.

### Step 4: Gates

**Verify**: `npm run admin:build`, `npm run admin:test`,
`npm run admin:typecheck`, `npm run admin:lint` — todos exit 0.

### Step 5: Registro

Mueve la fila "Admin Vite dev server cannot bootstrap" a la sección
Resolved de `docs/operations/DEFERRALS.md`, citando el commit del fix de
esta rama + "plan 257".

**Verify**: fila en Resolved; `npm run lint:md` 0 issues.

## Test plan

No hay test unitario natural para una config de dev-server; la prueba es
la reproducción antes/después (curl + smoke de navegador) y los gates del
build/producción intactos.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -n "proxy" -A3 admin/content-manager/vite.config.ts` muestra `'/api/v1'`
- [ ] `/api/client.ts` servido 200 por Vite; `/api/v1/health` proxied 200; SPA bootea sin errores (evidencia pre/post)
- [ ] `admin:build` + `admin:test` + `admin:typecheck` + `admin:lint` exit 0
- [ ] Fila 17 movida a Resolved
- [ ] Fila de `plans/README.md` actualizada (salvo despacho con override)

## STOP conditions

- Algún caller del cliente apunta a `/api/...` fuera de `/api/v1` —
  reportar con evidencia.
- El API server o Vite no arrancan en el worktree por razones de entorno —
  reportar (no improvisar puertos alternativos salvo para el smoke local,
  documentándolo).

## Maintenance notes

- Reviewer: confirma que el smoke de navegador se hizo de verdad (no solo
  curl) y que el registro quedó resuelto con su cita.
