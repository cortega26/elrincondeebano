# Prompt 15 - Migración controlada a PurgeCSS 8 (2026-02-13)

## Objetivo

Actualizar `purgecss` a v8 sin regresiones visuales, preservando estabilidad de render inicial (sin FOUC/flicker) y manteniendo el gate de seguridad contra CSS vacío.

## Cambios aplicados

1. Dependencias:
   - `package.json`: `purgecss` actualizado a `^8.0.0`.
   - `package-lock.json` regenerado.
2. Compatibilidad de build:
   - `tools/build.js` actualizado para enviar `content` y `css` como `raw entries` a PurgeCSS.
   - Se mantiene el guardrail: abortar si PurgeCSS produce CSS vacío.
   - Motivo: evitar problemas de resolución por rutas/globs en Windows con v8.

## Evidencia de verificación

Con Node `v22.20.0`:

1. `npm run lint` -> OK.
2. `npm run typecheck` -> OK.
3. `npm test` -> OK.
4. `npm run build` -> OK.
5. `npm run test:e2e` -> OK (`26 passed`, `12 skipped`).
6. `npm run smoke:manual` -> OK.
7. `node --test test/noFlicker.stylesheetLoading.test.js` -> OK.

Assets CSS generados:

- `build/dist/css/style.min.css` -> `90055` bytes.
- `build/dist/css/style.category.min.css` -> `89252` bytes.
- `build/dist/css/critical.min.css` -> `4321` bytes.

## Riesgos restantes

1. Pendiente pinning reproducible de dependencias Python en `admin/**`.
2. Pendiente guardrail automático para assets huérfanos.

## Rollback

1. Revertir commit/PR de este prompt.
2. Revalidar:
   - `npm run lint`
   - `npm run typecheck`
   - `npm test`
   - `npm run build`
