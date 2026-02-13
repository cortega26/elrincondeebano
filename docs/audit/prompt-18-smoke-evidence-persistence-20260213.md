# Prompt 18 - Evidencia persistente de smoke (2026-02-13)

## Objetivo

Cerrar el riesgo P2 de falta de evidencia persistente de smoke por release, implementando plantilla automatizada y artefacto CI/deploy sin introducir regresiones funcionales o visuales.

## Cambios aplicados

1. Script de evidencia:
   - Nuevo `scripts/smoke-evidence.mjs`.
   - Genera markdown en `reports/smoke/*.md` con metadata de commit/run y checklist.
2. Scripts npm:
   - `package.json`: nuevo `npm run smoke:evidence`.
3. Workflows:
   - `.github/workflows/ci.yml`:
     - genera evidencia smoke (`reports/smoke/ci-<sha>.md`) con `if: always()`;
     - sube artefacto `smoke-evidence`.
   - `.github/workflows/static.yml`:
     - genera evidencia smoke de despliegue (`reports/smoke/deploy-<sha>.md`);
     - sube artefacto `smoke-evidence-deploy`.
4. Tests:
   - Nuevo `test/smoke-evidence.script.test.js`.
   - `test/run-all.js` incluye la suite.
5. Documentación:
   - `docs/operations/SMOKE_TEST.md`: sección de evidencia persistente.
   - `docs/RELEASE.md`: exige evidencia smoke en release.
   - `AGENTS.md`, `docs/README.md`, `docs/audit/executive-summary-20260213.md` actualizados.

## Evidencia de verificación

1. `npm run lint` -> OK.
2. `npm run typecheck` -> OK.
3. `npm test` -> OK (incluye `smoke-evidence.script.test.js`).
4. `npm run build` -> OK.
5. `npm run smoke:evidence -- --output reports/smoke/local-check.md --status pending --commit local` -> OK.
6. `npm run test:e2e` -> OK (`26 passed`, `12 skipped`).

Nota operativa:
- `npm run guardrails` completo puede seguir fallando por `sw-cache-bump` si hay cambios previos de `service-worker.js` sin bump; no pertenece al alcance de este prompt.

## Riesgos restantes

1. P2: baseline de assets huérfanos aún alto; requiere limpieza incremental para reducir `orphan-assets.allowlist.json`.

## Rollback

1. Revertir commit/PR de Prompt 18 (`git revert <sha>`).
2. Revalidar baseline:
   - `npm run lint`
   - `npm run typecheck`
   - `npm test`
   - `npm run build`
   - `npm run test:e2e`
