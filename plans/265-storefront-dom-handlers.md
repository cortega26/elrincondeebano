# Plan 265: Storefront — DOM handlers de `initStorefront` (diferido del 245)

> **Executor instructions**: Sigue este plan paso a paso. Ejecuta cada
> comando de verificación y confirma el resultado esperado antes de pasar
> al siguiente paso. Si ocurre algo en la sección "STOP conditions",
> detente y reporta — no improvises. Al terminar, actualiza la fila de
> estado de este plan en `plans/README.md` — salvo que un reviewer te haya
> despachado y te haya dicho que mantiene el índice.
>
> **Drift check (run first)**: `git diff --stat c01ce06c..HEAD -- astro-poc/src/scripts/storefront.js astro-poc/src/scripts/storefront/ test/`

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: MED (wiring DOM; la red es e2e)
- **Depends on**: 245 (landed), 219/231 (landed)
- **Category**: refactor
- **Planned at**: commit `c01ce06c`, 2026-10-19

## Why this matters

El plan 245 extrajo las reglas de mutación del carrito a
`cart-controller.js` (21 reglas pineadas) y paró en el borde de los **DOM
handlers** (su nota: "requieren caracterización propia antes de moverse";
registrado en 250). `initStorefront` sigue con 479 líneas
(`storefront.js:1130-1608`), de las que la mayoría es wiring de eventos.

## Current state

`astro-poc/src/scripts/storefront.js` (1637 líneas totales):

- `initStorefront()` en `:1130`; wiring DOM dentro:
  - offcanvas del carrito (`show/shown/hide/hidden`) `:1271-1274`
  - cross-tab storage → `cartController.adoptCrossTabEvent` `:1280`
  - **`onDocumentClick`** (delegación en captura, ~170 líneas) `:1319`,
    attach en `:1491`
  - listener `change` `:1493`
  - keyword input / load-more / clear / empty-clear `:1525-1560`
- `cart-controller.js` (245) ya existe: la factory recibe deps inyectadas
  y `storefront.js` es el composition root.
- Specs vivas: `test/storefront.cart-controller.spec.js` (21 reglas),
  `test/storefront.catalog-view.spec.js`, `test/e2e-astro/cart-ux.spec.ts`,
  `storage-contract.spec.ts` (la red de conducta del wiring).

## Commands you will need

| Purpose      | Command                                                                                                              | Provenance | Expected on success |
| ------------ | -------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------- |
| Install      | `HUSKY=0 npm ci`                                                                                                     | declared   | exit 0              |
| Build        | `npm run build` (canónico; `build:fast` falla en checkout fresco)                                                    | declared   | exit 0              |
| Cart e2e     | `PLAYWRIGHT_SKIP_BUILD=1 npx playwright test -c playwright.astro.config.ts cart-ux.spec.ts storage-contract.spec.ts` | declared   | all pass            |
| Root tests   | `npm test` (o `CI_SKIP_BUILD_CONTRACT=1` con build ya hecho)                                                         | declared   | all pass            |
| E2E completa | `PLAYWRIGHT_SKIP_BUILD=1 npm run test:e2e`                                                                           | declared   | all pass            |
| Lint         | `npm run lint`                                                                                                       | declared   | exit 0              |
| Typecheck    | `npm run typecheck`                                                                                                  | declared   | exit 0              |

## Scope

**In scope**:

- `astro-poc/src/scripts/storefront.js` (composition root).
- `astro-poc/src/scripts/storefront/dom-handlers.js` (nuevo; nombre exacto a elección del executor si el estilo del dir pide otro).
- `test/storefront.dom-handlers.spec.js` (nuevo).

**Out of scope**:

- `cart-controller.js`, `cart-view.js`, `storefront-state.ts`, specs e2e.
- Cambios de conducta visibles.

## Git workflow

- Branch: `advisor/265-storefront-dom-handlers`
- Commits: caracterización primero, extracción después, tests al final —
  p. ej. `test(storefront): pin the DOM wiring behaviors as characterization todos (plan 265)`
  → `refactor(storefront): extract the DOM delegation into a factory (plan 265)`
  → `test(storefront): implement the DOM wiring rules against the factory (plan 265)`.
- No push, no PR.

## Steps

### Step 0: Baseline verde

Instala; build canónico; cart e2e (28) verde; `npm test` verde. Rojo →
STOP.

### Step 1: Caracterización PRIMERO (sin mover nada)

Lee el wiring de `initStorefront` (`:1271-1560`) y enumera **cada**
comportamiento observable como nombres de test (`it.todo`) en el spec
nuevo, con commit propio. Cubre al menos: la delegación de click (cada
rama: add-to-cart, qty +/-, remove, bundles, companion, personalización…),
el `change` listener, el offcanvas, load-more/clear, y el input de
keywords.

**Verify**: el commit contiene SOLO el spec con todos los todos (sin
tocar `storefront.js`); cart e2e sigue verde.

### Step 2: Extracción

Crea la factory (mismo estilo que `cart-controller.js`) recibiendo las
deps que los handlers cierran (cartController, elementos/query de
selectores, callbacks de render/telemetría; NO `document` como global si
es evitable — inyecta el target). Mueve los cuerpos **byte-idénticos**;
`storefront.js` instancia y adjunta los listeners; borra los inline.
Verifica mecánicamente los cuerpos movidos vs HEAD (como el 245:
`sed`+`diff`, documenta cada token que cambie y por qué).

**Verify**: cart e2e (28) verde; `npm test` verde; `npm run typecheck`.

### Step 3: Tests

Implementa los todos contra la factory (eventos sintéticos sobre un
fixture DOM / llamadas directas con stubs).

**Verify**: `npx vitest run test/storefront.dom-handlers.spec.js` verde;
`npm test` verde.

### Step 4: Gates finales

**Verify**: `npm run lint`; `npm run typecheck`; build canónico; **e2e
completa** (`PLAYWRIGHT_SKIP_BUILD=1 npm run test:e2e`) verde; registra
`initStorefront` antes/después (target < 300 líneas).

## Test plan

- Caracterización primero (todos), implementación contra la factory
  después; la red de conducta real es la e2e del carrito en CADA commit.
- Sin cambios de conducta: cualquier diff funcional en e2e es STOP.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] Todos → tests implementados (`grep -c "it.todo"` = 0; spec nuevo con N tests)
- [ ] Cuerpos movidos byte-idénticos (o diffs token-level documentados)
- [ ] Cart e2e verde en cada commit; e2e completa verde al final
- [ ] `initStorefront` reducido (registrar antes/después; objetivo < 300)
- [ ] lint + typecheck exit 0
- [ ] Fila de `plans/README.md` actualizada (salvo despacho con override)

## STOP conditions

- Un handler no puede caracterizarse sin API de navegador real (fuera de
  jsdom) — reportar el caso concreto.
- Un fallo e2e no reproducible en HEAD (preexistente) — reportar.
- La extracción exige cambiar conducta (orden de listeners, captura,
  timing) — reportar.

## Maintenance notes

- Reviewer: confirma e2e verde por commit, el byte-diff de los cuerpos y
  que la delegación conserva `capture: true` y el orden de attach.
