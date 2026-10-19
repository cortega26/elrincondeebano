# Plan 261: Preservar el `code` real en el envelope de errores 4xx (fila 13)

> **Executor instructions**: Sigue este plan paso a paso. Ejecuta cada
> comando de verificación y confirma el resultado esperado antes de pasar
> al siguiente paso. Si ocurre algo en la sección "STOP conditions",
> detente y reporta — no improvises. Al terminar, actualiza la fila de
> estado de este plan en `plans/README.md` — salvo que un reviewer te haya
> despachado y te haya dicho que mantiene el índice.
>
> **Drift check (run first)**: `git diff --stat f758af72..HEAD -- admin/content-manager/src/server/app.ts admin/content-manager/test/integration/bodylessRequests.test.ts docs/operations/DEFERRALS.md`

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW–MED
- **Depends on**: 253 (finding), 243 (landed)
- **Category**: bug / DX de errores
- **Planned at**: commit `f758af72`, 2026-10-19

## Why this matters

El plan 253 documentó (fila 13 del registro) que el handler central
enmascara **todo** 4xx no-HttpError como `NOT_FOUND`/`Not found`, así que
el `code` real de Fastify (p. ej. `FST_ERR_CTP_EMPTY_JSON_BODY` del 400
por body vacío) nunca llega al cliente — depurar errores de contrato es
innecesariamente ciego. Los errores propios (`HttpError`) ya preservan
code/message; el hueco es solo el path de internals de Fastify.

## Current state

`admin/content-manager/src/server/app.ts` (~:411-419):

```ts
app.setErrorHandler((err, request, reply) => {
  if (err instanceof HttpError) {
    return reply.status(err.statusCode).send({ error: { code: err.code, message: err.message } });
  }
  const status = (err as { statusCode?: number }).statusCode ?? 500;
  if (status < 500) {
    // Fastify internals (e.g. route not found): no internal details.
    return reply.status(status).send({ error: { code: 'NOT_FOUND', message: 'Not found' } });
  }
  ...
```

Consumidores/tests del shape actual (verificados):

- `test/integration/categoryMutationApi.test.ts:421` espera
  `REASSIGN_TARGET_NOT_FOUND` — un `HttpError`, **no afectado**.
- `test/integration/bodylessRequests.test.ts:81` — **comentario** que
  describe el enmascarado; hay que actualizarlo y añadir una sonda del
  comportamiento nuevo.
- El cliente web no ramifica por `error.code` (grep: cero usos); las
  páginas muestran `message`.

## Commands you will need

| Purpose    | Command                                                                                              | Provenance | Expected on success |
| ---------- | ---------------------------------------------------------------------------------------------------- | ---------- | ------------------- |
| Install    | `HUSKY=0 npm ci`                                                                                     | declared   | exit 0              |
| Admin test | `npm run admin:test`                                                                                 | declared   | all pass            |
| Focused    | `npx vitest run test/integration/bodylessRequests.test.ts test/contract/openapi.test.ts` (cwd admin) | declared   | all pass            |
| Typecheck  | `npm run admin:typecheck`                                                                            | declared   | exit 0              |
| Lint       | `npm run admin:lint`                                                                                 | declared   | 0 errors            |

## Scope

**In scope**:

- `admin/content-manager/src/server/app.ts` (solo el bloque `< 500`).
- `admin/content-manager/test/integration/bodylessRequests.test.ts`
  (comentario + sonda del código real).
- `docs/operations/DEFERRALS.md` (fila 13 → Resolved).

**Out of scope**:

- El path `HttpError`, el 5xx, el logging, el cliente web, otros tests.
- Cambiar status codes o comportamiento de rutas.

## Git workflow

- Branch: `advisor/261-4xx-error-code`
- Commits: `fix(admin): preserve the real 4xx error code in the envelope (plan 261)`
  y `docs(ops): resolve the 4xx-envelope register row (plan 261)`.
- No push, no PR.

## Steps

### Step 0: Baseline

Instala; `npm run admin:test` verde; reproduce el shape actual con una
sonda rápida (raw `fetch`/inject con body vacío + `Content-Type:
application/json` → hoy `{code:'NOT_FOUND', message:'Not found'}`).

### Step 1: Fix

En el bloque `< 500`:

- `code`: `typeof err.code === 'string' && err.code ? err.code :
'BAD_REQUEST'` (el code real de Fastify cuando existe).
- `message`: `typeof err.message === 'string' && err.message ?
err.message : 'Bad request'`.
- Actualiza el comentario ("Fastify internals" deja de ser cierto: se
  preserva code/message reales; los detalles internos de 5xx siguen
  enmascarados).

**Verify**: la sonda de Step 0 ahora devuelve el code real
(p.ej. `FST_ERR_CTP_EMPTY_JSON_BODY`); una ruta inexistente devuelve 404
con su code real de Fastify (regístralo; si no es un string estable,
fallback `BAD_REQUEST` es aceptable — documéntalo).

### Step 2: Test

En `bodylessRequests.test.ts`: actualiza el comentario de `:81` y añade
una sonda directa (fetch raw con `Content-Type: application/json` + body
vacío, sin el cliente) que afirme el **code real** en la respuesta (no
`NOT_FOUND`). Mantén la red de 253 (with/without-header) intacta.

**Verify**: `npx vitest run test/integration/bodylessRequests.test.ts` →
verde; `npm run admin:test` → verde (si algún test dependía del shape
enmascarado, STOP — ver condiciones).

### Step 3: Gates + registro

**Verify**: `npm run admin:typecheck`; `npm run admin:lint`;
`npx vitest run test/contract/openapi.test.ts`. Mueve la fila "Admin
central error envelope masks 4xx as `NOT_FOUND`" a Resolved citando el
commit del fix + "plan 261".

## Test plan

- Sonda directa del 400 con code real (nuevo).
- Suite de 253 intacta; admin completo verde.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] El bloque `< 500` usa `err.code` real (con fallbacks) y `err.message` real
- [ ] Sonda nueva afirma el code real (`FST_ERR_CTP_EMPTY_JSON_BODY`) — o el fallback documentado si el entorno no lo expone así
- [ ] `admin:test`/`typecheck`/`lint` verdes
- [ ] Fila 13 movida a Resolved
- [ ] Fila de `plans/README.md` actualizada (salvo despacho con override)

## STOP conditions

- Un consumidor real (código o test fuera de los listados) depende del
  shape enmascarado — reportar con evidencia.
- El `code` de Fastify no es un string en runtime — documentar el
  fallback aplicado.

## Maintenance notes

- Reviewer: confirma que el 5xx sigue genérico (`INTERNAL_ERROR`) y que
  HttpError no cambió.
