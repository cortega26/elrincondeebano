# Prompt 9 - Organización del repo (2026-02-13)

## Objetivo

Ordenar estructura y reducir ruido sin refactors masivos ni cambios de contratos públicos.

## Hallazgos

1. No existía un índice documental único para `docs/`.
2. Faltaba una guía explícita de estructura y convenciones de naming/imports.
3. Se detectaron artefactos rastreados sin uso operativo:
   - `log20260126183036.md` (log puntual en raíz).
   - `assets/images/jugos/Jugo Guallarauco mango 1L.avif.avif` (nombre con doble extensión y sin referencias en código/datos).
4. En `scripts/` existen utilidades manuales no canónicas en CI (`python_quality.ps1`, `fix_python_lint.ps1`, `image_to_webp_converter3.py`); se mantuvieron documentadas, no eliminadas.

## Cambios aplicados

1. Eliminación de ruido rastreado:
   - Se eliminó `log20260126183036.md`.
   - Se eliminó `assets/images/jugos/Jugo Guallarauco mango 1L.avif.avif`.
2. Estructura documental:
   - Nuevo índice: `docs/README.md`.
   - Nueva guía de estructura y convenciones: `docs/repo/STRUCTURE.md`.
3. Se actualizó el README principal para enlazar el índice documental.

## Convenciones documentadas

1. Mapa de carpetas canónicas (`src/`, `templates/`, `assets/`, `tools/`, `scripts/`, `test/`, `docs/`, `admin/`, `build/`).
2. Reglas de naming para módulos, tests y documentos de auditoría.
3. Reglas de imports y aislamiento entre capas runtime/tooling.
4. Reglas de higiene de repo previas a PR (`lint`, `test`, `build`).

## Verificación ejecutada

1. `npm run lint` ✅
2. `npm test` ✅
3. `npm run build` ✅
4. `npm run test:e2e` ✅
5. `npm run test:cypress` ✅

## Riesgos restantes

1. Persisten scripts manuales legacy en `scripts/` sin integración en CI (documentados, no removidos).
2. Puede haber más activos no referenciados en `assets/images/` que requieren limpieza asistida por inventario automático.
3. Conviene definir una política formal de “asset orphan detection” en guardrails para prevenir acumulación futura.
