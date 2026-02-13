# ADR 0002: Guardrails operativos y contratos de datos en la auditoría

- Fecha: 2026-02-13
- Estado: Aprobado

## Contexto

La auditoría incremental introdujo contratos explícitos para `product_data.json`, refuerzo de políticas de dependencias y runbooks operativos para reducir regresiones en producción.

## Decisión

1. Mantener validación contractual de datos como gate previo a build/release.
2. Ejecutar actualizaciones de dependencias por oleadas (`patch/minor` y `major` separadas).
3. Usar runbooks explícitos para debugging, triage y rollback en incidentes.
4. Estandarizar Node 22.x como runtime canónico para reproducibilidad local/CI.

## Consecuencias

### Positivas

1. Fallos de datos se detectan temprano y con mensajes accionables.
2. Menor riesgo al actualizar dependencias.
3. Incidentes más rápidos de diagnosticar y revertir.

### Costos

1. Más disciplina documental por PR.
2. Mayor fricción para cambios rápidos sin evidencia de verificación.
