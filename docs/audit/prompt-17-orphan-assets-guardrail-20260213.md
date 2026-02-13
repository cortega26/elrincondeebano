# Prompt 17 - Guardrail de assets huérfanos (2026-02-13)

## Objetivo

Mitigar el riesgo P2 de assets huérfanos introduciendo detección automática en CI y en flujo local, sin afectar render inicial ni comportamiento de runtime.

## Cambios aplicados

1. Nuevo guardrail:
   - `tools/guardrails/orphan-assets.js` detecta assets de `assets/images/**` no referenciados por catálogo/código.
   - Soporta baseline con `tools/guardrails/orphan-assets.allowlist.json`.
   - Genera reporte JSON con `--report`.
2. Integración de ejecución:
   - `package.json`:
     - `guardrails:assets`: `node tools/guardrails/orphan-assets.js --report reports/orphan-assets/latest.json`
     - `ci:guardrails` ahora incluye `guardrails:assets`.
   - `tools/guardrails/run.mjs` incluye `orphan-assets.js`.
   - `.github/workflows/ci.yml` agrega step `Guard orphan assets` y upload de `reports/orphan-assets` en failure.
3. Cobertura de pruebas:
   - `test/orphan-assets.guardrail.test.js` (detección, allowlist baseline y stale entries).
   - `test/run-all.js` actualizado para ejecutar esta suite.
4. Documentación:
   - `AGENTS.md`, `docs/operations/QUALITY_GUARDRAILS.md`, `docs/README.md`.
   - `docs/audit/executive-summary-20260213.md` actualizado: riesgo de assets huérfanos pasa a mitigado.

## Evidencia de verificación

1. `npm run lint` -> OK.
2. `npm run typecheck` -> OK.
3. `npm test` -> OK (incluye `orphan-assets.guardrail.test.js`).
4. `npm run build` -> OK.
5. `npm run guardrails:assets` -> OK.
   - Resultado: `Orphan asset guard passed (120 orphan assets, 209 references scanned).`
   - Reporte: `reports/orphan-assets/latest.json`.
6. `npm run test:e2e` -> OK (`26 passed`, `12 skipped`).

Nota operativa:
- `npm run guardrails` completo falla en este árbol por `sw-cache-bump` al detectar cambio existente en `service-worker.js` sin bump de prefijos; no forma parte de este bloque (se validó el nuevo guardrail de assets de forma específica).

## Riesgos restantes

1. P2: evidencia persistente de smoke manual por release (checklist/artefacto formal en CI).
2. Baseline inicial de assets huérfanos (`120`) requiere limpieza gradual para reducir allowlist con PRs pequeños.

## Rollback

1. Revertir commit/PR de Prompt 17 (`git revert <sha>`).
2. Revalidar baseline:
   - `npm run lint`
   - `npm run typecheck`
   - `npm test`
   - `npm run build`
   - `npm run test:e2e`
