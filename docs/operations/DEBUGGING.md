# Debugging Runbook

## Objetivo

Estandarizar depuración local para fallos de build, test y runtime sin introducir regresiones.

## Flujo rápido

1. Confirmar runtime:
   - `node -v` (objetivo 22.x)
2. Instalar limpio:
   - `npm ci`
3. Reproducir fallo en el menor scope posible:
   - lint: `npm run lint`
   - tests completos: `npm test`
   - test puntual: `npx vitest run <file>`
   - build: `npm run build`
   - e2e: `npm run test:e2e`
4. Aislar causa con diff mínimo:
   - `git status`
   - `git diff --stat`
5. Aplicar fix mínimo y volver a correr gates obligatorios.

## Casos frecuentes

1. `node` fuera de `PATH`:
   - usar: `npx -y node@22 "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" run <script>`
2. Fallos por condiciones de carrera en Windows (`ENOTEMPTY` en `build/`):
   - ejecutar `build` y `e2e` en secuencia, no en paralelo.
3. Falla solo en CI:
   - comparar versión de runtime y comandos exactos de workflow.
   - replicar local con `npm ci`.

## Evidencia mínima en PR

1. comando ejecutado
2. resultado
3. causa raíz
4. fix aplicado
5. rollback posible
