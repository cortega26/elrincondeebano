# Prompt 13 - Remediación de typecheck (2026-02-13)

## Objetivo

Eliminar la deuda roja de `typecheck` sin cambios funcionales ni regresiones de UX (incluyendo no introducir FOUC/flicker).

## Qué cambió

1. Configuración de typecheck:
   - `tsconfig.typecheck.json` ahora habilita `allowImportingTsExtensions` e incluye `src/js/**/*.d.ts`.
2. Declaraciones globales para chequeo estático:
   - `src/js/types/typecheck-globals.d.ts` (flags globales de `window`, `process` opcional).
3. Endurecimiento de tipos en módulos críticos con cambios no funcionales:
   - `src/js/modules/app-bootstrap.mjs`
   - `src/js/modules/bootstrap.mjs`
   - `src/js/modules/cart.mjs`
   - `src/js/modules/catalog-manager.mjs`
   - `src/js/modules/checkout.mjs`
   - `src/js/modules/deferred-css.mjs`
   - `src/js/modules/menu-controller.mjs`
   - `src/js/script.mjs`
   - `src/js/utils/data-endpoint.mjs`
   - `src/js/utils/product-data.mjs`
4. AGENTS/operación:
   - `AGENTS.md` actualizado para incluir `npm run typecheck` en comandos canónicos y checklist.

## Evidencia de verificación

Con Node `v22.20.0`:

1. `npm run typecheck` -> OK.
2. `npm run lint` -> OK.
3. `npm test` -> OK.
4. `npm run build` -> OK.
5. `npm run test:e2e` -> OK (`26 passed`, `12 skipped`).
6. `npm run smoke:manual` -> OK.

## Riesgos restantes

1. Pendientes de dependencias major (`eslint@10`, `purgecss@8`) para PRs independientes.
2. Pinning reproducible del entorno Python admin aún pendiente.

## Rollback

1. Revertir este bloque con `git revert <sha>` (o revert de PR completo).
2. Validar post-rollback con `npm run lint && npm test && npm run build`.
