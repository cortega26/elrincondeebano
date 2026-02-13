# Prompt 14 - Migración controlada a ESLint 10 (2026-02-13)

## Objetivo

Actualizar `eslint` a major v10 manteniendo baseline verde y sin introducir regresiones funcionales o visuales.

## Cambios aplicados

1. Dependencias:
   - `package.json`: `eslint` actualizado a `^10.0.0`.
   - `package-lock.json` regenerado.
   - Se agregan dependencias explícitas de config:
     - `@eslint/js`
     - `globals`
2. Compatibilidad con reglas nuevas de ESLint 10:
   - `scripts/run-cypress.mjs`: eliminación de asignación innecesaria (`no-useless-assignment`).
   - `server/productStore.js`: simplificación de inicialización de variables (`no-useless-assignment`).
   - `src/js/modules/service-worker-manager.mjs`: simplificación de flujo de fallback para `registration`.
   - `tools/fetch-fonts.mjs`: propagación de `cause` al relanzar errores (`preserve-caught-error`).
   - `tools/guardrails/_utils.mjs`: propagación de `cause` al relanzar errores.

## Verificación ejecutada

Con Node `v22.20.0`:

1. `npm run lint` -> OK.
2. `npm run typecheck` -> OK.
3. `npm test` -> OK.
4. `npm run build` -> OK.
5. `npm run test:e2e` -> OK (`26 passed`, `12 skipped`).
6. `npm run smoke:manual` -> OK.

## Riesgos restantes

1. Major pendiente: `purgecss@8` (requiere validación visual y de CSS resultante).
2. Pinning reproducible para dependencias Python admin.

## Rollback

1. Revertir commit/PR de este prompt.
2. Reinstalar lockfile previo y ejecutar:
   - `npm run lint`
   - `npm test`
   - `npm run build`
