# Rollback Runbook

## Objetivo

Restaurar estabilidad de producción con el menor tiempo de recuperación y riesgo de regresión.

## Cuándo aplicar rollback

1. build o despliegue rompe rutas críticas
2. regresión funcional confirmada en flujo crítico
3. aumento de errores sin fix inmediato seguro

## Procedimiento estándar

1. Identificar commit/PR causante.
2. Ejecutar rollback con:
   - `git revert <sha>`
3. Verificar en rama de rollback:
   - `npm run lint`
   - `npm test`
   - `npm run build`
   - `npm run test:e2e` (smoke mínimo si urge)
4. Desplegar rollback.
5. Confirmar recuperación en producción.

## Rollback de caché/SW

1. Si aplica, bump de prefijo de caché en `service-worker.js`.
2. Publicar nuevo build para invalidar cache obsoleto.
3. Confirmar en navegador limpio que se usa el nuevo prefijo.

## Post-rollback

1. abrir incidente con causa raíz preliminar
2. crear fix-forward en PR separado
3. agregar test que capture la regresión
