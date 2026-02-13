# Prompt 20 - Poda incremental de assets huérfanos (Batch 2, 2026-02-13)

## Objetivo

Continuar PR-H con una segunda poda segura de assets huérfanos (lote acotado), manteniendo cero regresiones en runtime y UI.

## Cambios aplicados

1. Se eliminaron 13 archivos huérfanos en `assets/images/snacks_salados/**`:
   - `Marco Polo - Papas Onduladas Corte Americano 350g.webp`
   - `Marco Polo - Papas Onduladas Caseras 350g.webp`
   - `Marco Polo - Ramitas Saladas 170g.webp`
   - `Papas Artesanales Merken 150g Lay's.webp`
   - `Papas Artesanales Caprese 150g Lay's.webp`
   - `Ramitas-Sal-170gr.webp`
   - `Ramitas-Queso-170gr.webp`
   - `Panchitos 320g Pancho Villa.webp`
   - `Pancho Villa - Panchitos Chilísimos 100g.webp`
   - `Pancho Villa - Panchitos BBQ 100g.webp`
   - `Lays Orégano 180g.webp`
   - `Lays-Jamón-Serrano-200gr.webp`
   - `Lays-Jamón-Serrano-180gr 800x800.webp`
2. Se actualizó baseline:
   - `tools/guardrails/orphan-assets.allowlist.json`.
   - Reducción de huérfanos: `109 -> 96`.
3. Impacto de tamaño aproximado:
   - `1047224 bytes` (~`1022.68 KB`) eliminados en este lote.

## Evidencia de verificación

1. `npm run lint` -> OK.
2. `npm run typecheck` -> OK.
3. `npm test` -> OK.
4. `npm run build` -> OK.
5. `npm run guardrails:assets` -> OK (`96 orphan assets`, `209 references scanned`).
6. `npm run test:e2e` -> OK (`26 passed`, `12 skipped`).

## Riesgos restantes

1. Quedan `96` huérfanos en allowlist; se requiere al menos un lote adicional.
2. Persisten riesgos de assets legacy no detectados si aparecen referencias fuera del scope de escaneo definido.

## Rollback

1. Revertir commit/PR (`git revert <sha>`).
2. Revalidar baseline:
   - `npm run lint`
   - `npm run typecheck`
   - `npm test`
   - `npm run build`
   - `npm run guardrails:assets`
   - `npm run test:e2e`
