# Plan 269: Cart batching — medir primero el coste por click de `addBundleItems` (PERF-08)

> **Executor instructions**: Sigue este plan paso a paso. Ejecuta cada
> comando de verificación y confirma el resultado esperado antes de pasar
> al siguiente paso. Si ocurre algo en la sección "STOP conditions",
> detente y reporta — no improvises. Al terminar, actualiza la fila de
> estado de este plan en `plans/README.md` — salvo que un reviewer te haya
> despachado y te haya dicho que mantiene el índice.
>
> **Drift check (run first)**: `git diff --stat 306debde..HEAD -- astro-poc/src/scripts/storefront/cart-controller.js astro-poc/src/scripts/storefront/storefront.js test/storefront.cart-controller.spec.js docs/operations/DEFERRALS.md`
> (Nota: `storefront.js` es el composition root; `cart-controller.js` es el
> de la factory. Este plan toca SOLO la factory + su spec.)

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: MED (semántica del carrito; red = spec + e2e)
- **Depends on**: 245 (factory), 219 (reglas persist-first), 265 (DOM)
- **Category**: perf / refactor
- **Planned at**: commit `306debde`, 2026-10-19
- **Gate del registro (PERF-08)**: la fila está **OPEN — measured** y su
  trigger es "measured evidence ... against plan 187's bar (card-map,
  single-compute state, scoped sync, probe cache, debounced signals
  landed; LH 70/100/96/100)". Este plan **mide antes de implementar** y
  cierra la fila con veredicto (implementado o REJECTED con números).

## Why this matters

`addBundleItems` (`cart-controller.js:139-167`) hace
`bundleItems.forEach(... setQty(id, getQty+1, product))` — y `setQty`
(`:90-137`) ejecuta **por ítem**: rebase+`saveCart`, `updateBadge`,
`renderCart`, `syncAllActionAreas`, `trackProductSignal`. Un bundle de 4
ítems = **4 persist + 4 renders + 4 badges + 4 syncs** en un mismo click.
El comentario del 245 lo dejó explícito: "do not batch the per-item
renders of addBundleItems here (plan 250 owns that)". La fila PERF-08
exige medir si eso sigue dominando antes de tocarlo.

## Current state

- `setQty` (líneas 90-137): rebase desde storage si stale (una vez),
  clamp de stock, merge de duplicados (`sameCartProduct`), **un**
  `saveCart`, `updateBadge`, `renderCart`, `syncAllActionAreas`,
  `trackProductSignal(id,'addedCount')` si sube, clear de
  `isOrderJustSent`.
- `addBundleItems` (139-167): loop de `setQty` (N× todo lo anterior);
  devuelve `true` si añadió algo; salta ítems sin id.
- Specs: `test/storefront.cart-controller.spec.js` (21 reglas, incluye el
  orden persist→render y los guards de stock); e2e `cart-ux` +
  `storage-contract` (28) cubren el flujo real incluido el bundle de
  `/combos/` (add de 4).
- Barra del 187: LH home 70/100/96/100 (no regresar) + mejoras ya
  aterrizadas (card-map, single-compute, scoped sync, probe cache,
  signals debounced).

## Commands you will need

| Purpose      | Command                                                                                                              | Provenance | Expected on success |
| ------------ | -------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------- |
| Install      | `HUSKY=0 npm ci`                                                                                                     | declared   | exit 0              |
| Build        | `npm run build` (canónico)                                                                                           | declared   | exit 0              |
| Cart e2e     | `PLAYWRIGHT_SKIP_BUILD=1 npx playwright test -c playwright.astro.config.ts cart-ux.spec.ts storage-contract.spec.ts` | declared   | 28 passed           |
| Root tests   | `npm test` (o `CI_SKIP_BUILD_CONTRACT=1`)                                                                            | declared   | all pass            |
| E2E completa | `PLAYWRIGHT_SKIP_BUILD=1 npm run test:e2e`                                                                           | declared   | 84 passed / 2 skip  |
| LH home      | `LH_SKIP_BUILD=1 npm run lighthouse:audit`                                                                           | declared   | ≥ 70/100/96/100     |
| Lint         | `npm run lint`                                                                                                       | declared   | exit 0              |

## Scope

**In scope**:

- `astro-poc/src/scripts/storefront/cart-controller.js` (solo el camino
  de `addBundleItems`/flush compartido).
- `test/storefront.cart-controller.spec.js` (reglas nuevas del batch).
- `docs/operations/DEFERRALS.md` (fila PERF-08 → Resolved con veredicto).

**Out of scope**:

- `storefront.js` (composition root), `cart-view.js`, `storefront-state.ts`,
  specs e2e, listener wiring (265).

## Git workflow

- Branch: `advisor/269-cart-batching`
- Commits: medición (nota con números) → implementación (si el gate pasa)
  → tests → registro. Todos con `(plan 269)`.
- No push, no PR.

## Steps

### Step 0: Baseline

Instala; build canónico; cart e2e 28 verde; `npm test` verde; LH home
baseline registrado.

### Step 1: MEDIR (antes de tocar código)

Script throwaway en `/tmp/opencode` (Playwright + CDP `Performance`):

1. **Conteo estático** (lectura de código + spec): confirma que un
   bundle de 4 produce 4 `saveCart`/`renderCart`/`updateBadge`/`sync`.
2. **Timing real**: en `/combos/`, mide `TaskDuration`/`ScriptDuration`
   (CDP `Performance.getMetrics`) alrededor del click de "añadir combo"
   (4 ítems) vs un add-to-cart simple; N=5 repeticiones, mediana.
3. Registra: ms por interacción (single vs bundle4), delta atribuible a
   los 3 flushes extra, y el coste por flush.

**Gate**: implementa SOLO si el ahorro proyectado del batch (3 flushes
menos + 3 renders menos) es **≥ 8 ms por bundle-add** o **≥ 25% del
TaskDuration del bundle**. Si no → **REJECTED con números** (documenta,
resuelve la fila con el veredicto y termina; no implementes).

### Step 2: Implementar (solo si el gate pasa)

Refactor mínimo: extrae el cuerpo de mutación sin side effects
(rebase/clamp/merge/telemetry por ítem) y un `flush()` único
(save→badge→render→sync). `setQty` = mutate + flush (idéntico);
`addBundleItems` = loop mutate + **un** flush. Preservar EXACTAMENTE:

- merge de duplicados y acumulación secuencial (bundle con el mismo id ×2);
- cap de stock por ítem (clamp);
- `trackProductSignal` por ítem que sube (barato, debounced);
- clear de `isOrderJustSent` una vez;
- si `saveCart` falla → mismo comportamiento de error y sin render;
- `syncAllActionAreas`: el viejo sincronizaba por ítem con su id; el
  batch usa scope completo (null) — documenta la equivalencia.

**Verify**: cart e2e 28 verde; `npm test` verde.

### Step 3: Tests

Extiende `test/storefront.cart-controller.spec.js`:

- bundle de N ítems → `saveCart`/`renderCart`/`updateBadge`/`sync` **una
  vez** cada uno (spies con `invocationCallOrder`);
- duplicados en el bundle acumulan (merge max-wins) y el cap de stock
  aplica por ítem;
- telemetría por ítem (N calls) pero un solo persist;
- fallo de `saveCart` en batch → sin render, mismo error.

**Verify**: focused verde; las 21 reglas previas intactas.

### Step 4: Gates + registro

**Verify**: cart e2e 28; e2e completa 84/2; LH home ≥ baseline;
`npm run lint`; `npm run typecheck`; `npm test`. Resuelve la fila
"Cart-interaction batching" citando el commit + el veredicto y los
números (implementado: X ms ahorrados; o REJECTED: por qué no compensa).

## Test plan

- Spec: call-counts del batch + semántica por ítem (duplicados, cap,
  telemetría, error).
- e2e: bundle real de `/combos/` en cart-ux; storage-contract intacto.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] Medición registrada (single vs bundle4, ms, coste por flush) y veredicto del gate
- [ ] Si implementado: save/render/badge/sync = **1** por bundle (spec), semántica por ítem intacta
- [ ] cart e2e 28 + e2e completa 84/2 verdes; LH home sin regresión
- [ ] lint + typecheck + root tests verdes
- [ ] Fila PERF-08 resuelta con números
- [ ] Fila de `plans/README.md` actualizada (salvo despacho con override)

## STOP conditions

- La medición muestra que el coste dominante NO son los flushes (p.ej.
  render/badge mismo) — REJECTED + reporte (no implementar a ciegas).
- El batch exige cambiar conducta en un edge case (stock, duplicados,
  error de save) — reportar en vez de forzar.
- Números preexistentes raros (e2e/LH) no reproducibles en HEAD — reportar.

## Maintenance notes

- Reviewer: confirma que el `setQty` simple no cambió (spec 21 reglas) y
  que el batch no reordena persist→render.
