# Debugging Runbook

## Objetivo

Estandarizar depuración local para fallos de build, test y runtime sin introducir regresiones.

## Flujo rápido

1. Confirmar runtime:
   - `node -v` (objetivo 24.x)
2. Instalar limpio:
   - `npm ci`
   - `(cd astro-poc && npm ci)`
3. Reproducir fallo en el menor scope posible:
   - lint: `npm run lint`
   - typecheck canónico: `npm run typecheck`
   - tests completos: `npm test`
   - test puntual: `npx vitest run <file>`
   - build: `npm run build`
   - e2e canónico Astro: `npm run test:e2e`
4. Aislar causa con diff mínimo:
   - `git status`
   - `git diff --stat`
5. Aplicar fix mínimo y volver a correr gates obligatorios.

## Cuando el problema es de performance

1. Confirmar si la regresión está en build-time, browser runtime, o live probe.
2. Para UX/rendering:
   - `npm run build`
   - `npm run lighthouse:audit`
   - `npm run test:e2e`
3. Para fetch o catálogo:
   - revisar `slow_endpoint_detected`, `web_vitals_snapshot`, y cambios en
     `data/product_data.json`.
4. Comparar antes/después del cambio:
   - tamaño de inputs (`data/`, `assets/images/`)
   - paths tocados en `astro-poc/src/`, `src/js/`, `tools/`
5. Si la regresión es real pero la corrección es grande:
   - abrir un follow-up pequeño y reversible antes de mezclar refactor amplio.

## Cuando el problema es de escalabilidad o mantenibilidad

1. Buscar trabajo repetido:
   - múltiples scans completos de catálogo
   - múltiples recorridos del árbol de imágenes
   - comandos nuevos que duplican gates existentes
2. Confirmar si la solución correcta es:
   - reutilizar un módulo existente
   - mover trabajo al preflight/build
   - documentar una restricción duradera en ADR o arquitectura
3. Si el cambio introduce una nueva superficie operativa:
   - actualizar `docs/START_HERE.md`, `docs/repo/STRUCTURE.md`, y el runbook
     correspondiente en el mismo PR.

## Casos frecuentes

1. `node` fuera de `PATH`:
   - usar: `npx -y node@24 "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" run <script>`
2. Fallos por condiciones de carrera en Windows (`ENOTEMPTY` en `astro-poc/dist/` o `.astro/`):
   - ejecutar `build` y `e2e` en secuencia, no en paralelo.
3. Falla solo en CI:
   - comparar versión de runtime y comandos exactos de workflow.
   - replicar local con `npm ci` y `(cd astro-poc && npm ci)`.

## Evidencia mínima en PR

1. comando ejecutado
2. resultado
3. causa raíz
4. fix aplicado
5. rollback posible
6. nota de performance/escala si el problema involucró tiempos, tamaño de
   inputs, o crecimiento del catálogo/assets
