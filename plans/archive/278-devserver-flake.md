# Plan 278: Fix del flake de CI en `dev-server.security.test.mjs` (puerto EADDRINUSE)

> **Executor instructions**: Sigue este plan paso a paso. Ejecuta cada
> comando de verificación y confirma el resultado esperado antes de pasar
> al siguiente paso. Si ocurre algo en la sección "STOP conditions",
> detente y reporta — no improvises. Al terminar, actualiza la fila de
> estado de este plan en `plans/README.md` — salvo que un reviewer te haya
> despachado y te haya dicho que mantiene el índice.
>
> **Drift check (run first)**: `git diff --stat 4338ee83..HEAD -- test/dev-server.security.test.mjs scripts/dev-server.mjs`

## Status

- **Priority**: P2 (CI rojo)
- **Effort**: S
- **Risk**: LOW
- **Depends on**: — (flake detectado en el run 39287745419, commit 4338ee83)
- **Category**: test / CI reliability
- **Planned at**: commit `4338ee83`, 2026-10-19

## Why this matters

El push `4338ee83` (solo README) puso **CI rojo**: `Unit Tests (root)` →
`dev-server.security.test.mjs > dev server path containment` **timeout
5000 ms** por `EADDRINUSE :::50336`. El test elige un puerto
pseudoaleatorio (`42000 + ((pid*31 + rand*1000) % 20000)`, línea 27);
si ese puerto ya está tomado (otro worker/servicio), el child muere y el
test espera hasta el timeout. Es un **flake de puerto**, no un fallo de
contención de paths. Con CI rojo no hay cierre posible.

## Current state

- `test/dev-server.security.test.mjs` (110 líneas): puerto aleatorio
  (línea 27), `spawn` con `PORT` en env y `stdio: ['ignore','ignore','inherit']`
  (líneas 28-32), `await waitForServer(port)` (línea 34), timeout por
  defecto de vitest (5 s).
- `scripts/dev-server.mjs`: `const port = Number(process.env.PORT || 8080);`
  y `server.listen(port, () => console.log(...${port}...))` (líneas
  13/111-112) — con `PORT=0` Node asigna un puerto efímero, pero el log
  imprime **0**, no el puerto real.
- Los asserts del test (contención de paths/symlinks) son correctos y no
  se tocan.

## Commands you will need

| Purpose    | Command                                                                                       | Provenance | Expected on success |
| ---------- | --------------------------------------------------------------------------------------------- | ---------- | ------------------- |
| Install    | `HUSKY=0 npm ci`                                                                              | declared   | exit 0              |
| Test       | `npx vitest run test/dev-server.security.test.mjs`                                            | declared   | verde               |
| Repetición | `for i in $(seq 1 20); do npx vitest run test/dev-server.security.test.mjs \|\| exit 1; done` | declared   | 20/20               |
| Suite raíz | `CI_SKIP_BUILD_CONTRACT=1 npm test` (o con build)                                             | declared   | verde               |
| Lint       | `npm run lint`                                                                                | declared   | exit 0              |

## Scope

**In scope**:

- `scripts/dev-server.mjs` (loguear el puerto **realmente asignado**).
- `test/dev-server.security.test.mjs` (PORT=0 + parseo del puerto desde
  stdout + timeout explícito).

**Out of scope**:

- Los asserts de seguridad; otros tests; comportamiento del server con
  puerto fijo (debe quedar idéntico).

## Git workflow

- Branch: `advisor/278-devserver-flake`
- Commit: `test: make the dev-server security test port-safe (plan 278)`.
- No push, no PR.

## Steps

### Step 0: Reproducir/observar

`npx vitest run test/dev-server.security.test.mjs` → verde local (el
flake es de colisión). Revisa `waitForServer` y el cleanup (`child.kill`)
en el resto del archivo.

### Step 1: Server: puerto real

En `scripts/dev-server.mjs`, en el callback de `listen`, usa
`server.address()` para obtener el puerto efectivo (objeto `{port}`;
fallback al `port` configurado) y loguea ESE. Con puerto fijo el mensaje
no cambia; con `PORT=0` ahora el puerto real es parseable.

**Verify**: `PORT=0 node scripts/dev-server.mjs <dir>` (temporal) imprime
un puerto ≠ 0 y sirve; `PORT=8099` imprime 8099.

### Step 2: Test: PORT=0 + parseo

- Spawn con `PORT=0` y `stdio: ['ignore','pipe','pipe']`.
- Espera la línea `Static server running at http://127.0.0.1:<port>` (con
  timeout explícito p.ej. 10 s y fallo con stderr si el proceso muere),
  extrae el puerto y úsalo en los `httpGet`.
- Timeout del test explícito (p.ej. 15000 ms). Mantén TODOS los asserts.

**Verify**: el test pasa; `waitForServer(port)` se sustituye por la
espera de la línea (o se adapta), sin polling ciego.

### Step 3: Estabilidad + gates

**Verify**: repetición 20× verde (comando de la tabla); suite raíz verde;
`npm run lint` exit 0; `git status` limpio.

## Test plan

- El propio test, repetido 20× (antes/después del cambio de puerto).
- Suite raíz completa para descartar efectos.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `PORT=0` produce un puerto real en el log; puerto fijo idéntico
- [ ] Test verde **20/20** consecutivas; suite raíz verde; lint 0
- [ ] Asserts de seguridad intactos
- [ ] Fila de `plans/README.md` actualizada (salvo despacho con override)

## STOP conditions

- El server no puede exponer el puerto real sin cambiar su contrato con
  los consumidores (p.ej. alguien parsea el log actual) — reportar.
- El parseo de stdout resulta frágil con el runner de CI — proponer
  alternativa (retry sobre EADDRINUSE con puerto nuevo) y reportar.

## Maintenance notes

- Reviewer: confirma 20/20, el log con puerto real y que `PORT` fijo no
  cambió; tras el merge, el push debe poner CI verde (run de verificación).
