# Plan 258: Deuda de typecheck de los specs e2e (19 errores) → 0 y cableado permanente

> **Executor instructions**: Sigue este plan paso a paso. Ejecuta cada
> comando de verificación y confirma el resultado esperado antes de pasar
> al siguiente paso. Si ocurre algo en la sección "STOP conditions",
> detente y reporta — no improvises. Al terminar, actualiza la fila de
> estado de este plan en `plans/README.md` — salvo que un reviewer te haya
> despachado y te haya dicho que mantiene el índice.
>
> **Drift check (run first)**: `git diff --stat 9f5558d0..HEAD -- tsconfig.json package.json test/e2e-astro/ docs/operations/DEFERRALS.md`

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: 227 (debt registered), 236 (landed)
- **Category**: dx / types
- **Planned at**: commit `9f5558d0`, 2026-10-19

## Why this matters

El plan 227 retiró el cableado de typecheck de los specs e2e por esta
deuda (fila 10 del registro). Hoy son **exactamente 19 errores** bajo el
`tsconfig.json` raíz (que ya incluye `test/e2e-astro/**/*.ts`), y son
separables de la deuda del árbol de tests del admin (143 errores, sigue
registrada). Cerrarla + cablear `typecheck:e2e` en `typecheck` evita que
vuelva a crecer sin que nadie lo note.

## Current state

`npx tsc --noEmit -p tsconfig.json` → **19 errores**, verificado:

- **16× TS2339** `Property '__APP_READY__' does not exist on type
'Window & typeof globalThis'` en 12 archivos de `test/e2e-astro/`
  (cart-card-order-stability ×2, deploy-canary, mobile-home-ux,
  mobile-home-visual, parity-smoke ×5, product-detail-content,
  share-preview-contract, skip-link, storage-contract,
  storefront-visual-refinement, ver-combos-nav).
- **1× TS2339** `Property 'page' does not exist on type 'TestDetails'`
  en `share-preview-contract.spec.ts:7` — la firma usa
  `Parameters<typeof test>[1]['page']`, que apunta a `TestDetails`, no al
  body del test.
- **2× TS5097** import con extensión `.ts`
  (`product-og-compat.spec.ts:3` y `share-preview-contract.spec.ts:3`,
  ambos `../../astro-poc/src/lib/product-identity.ts`).

Contexto del config raíz (`tsconfig.json`): `target ES2022`, `module
NodeNext`, `noEmit: true`, `strict: false`, `types: ["node"]`,
`include: ["playwright.config.ts", "playwright.astro.config.ts",
"test/e2e-astro/**/*.ts"]`. `npm run typecheck` =
`typecheck:astro && admin:typecheck` (sin pata e2e).

## Commands you will need

| Purpose        | Command                                                                                                                              | Provenance | Expected on success |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------- | ------------------- |
| Install        | `HUSKY=0 npm ci`                                                                                                                     | declared   | exit 0              |
| Reproducir     | `npx tsc --noEmit -p tsconfig.json`                                                                                                  | declared   | 19 errores (antes)  |
| Typecheck e2e  | `npx tsc --noEmit -p tsconfig.json`                                                                                                  | declared   | 0 errores (después) |
| Typecheck raíz | `npm run typecheck`                                                                                                                  | declared   | exit 0              |
| Tests root     | `npm test` (build canónico antes si hace falta)                                                                                      | declared   | all pass            |
| E2E focused    | `PLAYWRIGHT_SKIP_BUILD=1 npx playwright test -c playwright.astro.config.ts product-og-compat.spec.ts share-preview-contract.spec.ts` | declared   | all pass            |

## Scope

**In scope**:

- `tsconfig.json` (raíz: `allowImportingTsExtensions` + include del
  archivo de declaración si hace falta).
- `test/e2e-astro/globals.d.ts` (nuevo).
- `test/e2e-astro/share-preview-contract.spec.ts` (solo la firma del
  helper y el import de tipo).
- `package.json` (script `typecheck:e2e` + cadena en `typecheck`).
- `docs/operations/DEFERRALS.md` (mover la fila 10 a Resolved).

**Out of scope**:

- La deuda del árbol de tests del admin (143 errores) — sigue registrada.
- Cambios de conducta en los specs: solo tipos/config.

## Git workflow

- Branch: `advisor/258-e2e-typecheck`
- Commits: `chore(types): declare __APP_READY__ and fix e2e spec types (plan 258)`
  y `chore(dx): wire typecheck:e2e into typecheck + resolve the register row (plan 258)`.
- No push, no PR.

## Steps

### Step 0: Baseline

Instala; reproduce los 19 errores con el comando de la tabla. Cualquier
otro error → STOP (preexistente distinto).

### Step 1: Declaración ambiental

Crea `test/e2e-astro/globals.d.ts`:

```ts
export {};

declare global {
  interface Window {
    __APP_READY__?: boolean;
  }
}
```

(Verifica el tipo real contra un uso: `window.__APP_READY__ === true` o
asignación; ajusta a `boolean | undefined` si el uso lo pide.) Si el
`include` no lo recoge, añade la ruta explícita.

**Verify**: los 16 TS2339 desaparecen.

### Step 2: Extensiones `.ts`

Añade `"allowImportingTsExtensions": true` al `tsconfig.json` raíz
(válido con `noEmit: true`).

**Verify**: los 2 TS5097 desaparecen.

### Step 3: Firma del helper

En `share-preview-contract.spec.ts`, importa `type Page` de
`@playwright/test` y tipa el parámetro como `page: Page` (en lugar de
`Parameters<typeof test>[1]['page']`). Sin cambios de runtime.

**Verify**: el TS2339 de `TestDetails.page` desaparece; **0 errores
totales**.

### Step 4: Cableado permanente

En `package.json` raíz:

- añade `"typecheck:e2e": "tsc --noEmit -p tsconfig.json"`;
- encadénalo: `"typecheck": "npm run typecheck:astro && npm run admin:typecheck && npm run typecheck:e2e"`.

**Verify**: `npm run typecheck` exit 0 (las tres patas).

### Step 5: Gates + registro

**Verify**: `npx tsc --noEmit -p tsconfig.json` 0; `npm test` verde;
build canónico + e2e focused de los dos specs tocados verdes (solo tipos,
pero se prueba que la suite carga); `npm run lint` exit 0.
Mueve la fila "E2E spec typecheck debt" a Resolved citando el commit del
fix + "plan 258" (la fila del árbol admin **no** se toca).

## Test plan

- La propia deuda ES el test: 19 → 0 errores, y el cableado la hace
  permanente.
- E2E focused de los dos specs con cambios de tipo (product-og-compat,
  share-preview-contract) tras build canónico.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npx tsc --noEmit -p tsconfig.json` → 0 errores
- [ ] `npm run typecheck` incluye `typecheck:e2e` y exit 0
- [ ] `test/e2e-astro/globals.d.ts` existe y declara `__APP_READY__`
- [ ] `npm test` y e2e focused verdes
- [ ] Fila 10 movida a Resolved (la del admin test-tree sigue abierta)
- [ ] Fila de `plans/README.md` actualizada (salvo despacho con override)

## STOP conditions

- Aparece un error distinto a los 19 al reproducir (preexistente nuevo) —
  reportar sin arreglar.
- `allowImportingTsExtensions` rompe otro consumidor del tsconfig raíz —
  reportar.
- Arreglar `TestDetails.page` exige cambiar semántica de runtime — STOP.

## Maintenance notes

- Reviewer: confirma que el cableado corre en el script que usa CI y que
  la fila del admin test-tree quedó intacta.
