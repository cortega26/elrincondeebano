# Prompt 19 - Poda incremental de assets huérfanos (2026-02-13)

## Objetivo

Ejecutar la primera poda real de assets huérfanos (PR-G) con bajo riesgo de regresión, reduciendo baseline sin tocar rutas, contratos ni renderizado inicial.

## Cambios aplicados

1. Se eliminaron 11 archivos huérfanos en `assets/images/software/**` (sin referencias en catálogo/runtime):
   - `Office-2019-Professional-Plus.webp`
   - `Office-pro-2021-plus.webp`
   - `Office-professional-plus-2016-international.webp`
   - `W10_1_P_Windows10.webp`
   - `Windows 10 Home.png`
   - `Windows 10 Pro.webp`
   - `Windows 11 Pro.webp`
   - `Windows-10-Pro-Digital-2.webp`
   - `licencia-digital-windows-11-home.webp`
   - `office-professional-plus-2021.jpg`
   - `shbv2z9d_2866ee9d_thumbnail_512.jpg`
2. Se actualizó baseline:
   - `tools/guardrails/orphan-assets.allowlist.json`.
   - Reducción de huérfanos: `120 -> 109`.
3. Impacto en tamaño de repositorio:
   - Aproximadamente `221070 bytes` (~`215.89 KB`) eliminados.

## Evidencia de verificación

1. `npm run lint` -> OK.
2. `npm run typecheck` -> OK.
3. `npm test` -> OK.
4. `npm run build` -> OK.
5. `npm run guardrails:assets` -> OK (`109 orphan assets`, `209 references scanned`).
6. `npm run test:e2e` -> OK (`26 passed`, `12 skipped`).

## Riesgos restantes

1. Permanecen `109` huérfanos históricos en allowlist; requiere más lotes pequeños.
2. Persisten riesgos de falso positivo si en el futuro aparecen referencias externas fuera del scope de escaneo.

## Rollback

1. Revertir commit/PR (`git revert <sha>`).
2. Revalidar baseline:
   - `npm run lint`
   - `npm run typecheck`
   - `npm test`
   - `npm run build`
   - `npm run guardrails:assets`
   - `npm run test:e2e`
