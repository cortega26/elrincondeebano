# Prompt 12 - AGENTS y operación diaria (2026-02-13)

## Objetivo

Dejar el repositorio operable por agentes futuros con comandos canónicos, runbooks mínimos y guía de re-auditoría.

## Cambios aplicados

1. `AGENTS.md` actualizado con:
   - comandos canónicos de ejecución/validación
   - checklist PR mínimo
   - mini guía `How to audit again`
   - referencias a runbooks nuevos y política de dependencias
2. Runbooks mínimos agregados:
   - `docs/operations/DEBUGGING.md`
   - `docs/operations/INCIDENT_TRIAGE.md`
   - `docs/operations/ROLLBACK.md`
3. ADR de cierre operativo:
   - `docs/adr/0002-audit-ops-guardrails.md`
4. Índice de documentación:
   - `docs/README.md` actualizado con nuevos artefactos.

## Verificación ejecutada

Con Node 22:

1. `npm run lint` -> OK
2. `npm test` -> OK
3. `npm run build` -> OK
4. `npm run test:e2e` -> OK (`26 passed`, `12 skipped`)
5. `npm run smoke:manual` -> OK (checklist impreso)

Nota operativa: en Windows, `build` y `test:e2e` no deben ejecutarse en paralelo porque comparten `build/`; se validó en secuencia.

## Riesgos restantes

1. `typecheck` global sigue como deuda histórica (no resuelto en este prompt).
2. Quedan majors de dependencias planificados para PRs separados.

## Backlog recomendado

1. PR dedicado para `typecheck` (JSDoc/types y globals).
2. PR de majors: `eslint@10`.
3. PR de majors: `purgecss@8` con validación visual y de CSS resultante.
4. PR de pinning reproducible para Python admin (`requirements` con constraints/lock).
