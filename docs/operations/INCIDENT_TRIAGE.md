# Incident Triage Runbook

## Severidad

1. `SEV-1`: sitio inaccesible o checkout/contacto crítico caído.
2. `SEV-2`: degradación relevante (errores intermitentes, datos desactualizados).
3. `SEV-3`: fallo menor con workaround.

## Triage inicial (primeros 10 minutos)

1. Confirmar alcance:
   - rutas afectadas
   - navegadores/dispositivos
   - entorno (prod/staging/local)
2. Revisar últimos cambios desplegados y commits.
3. Verificar logs/telemetría:
   - errores frontend
   - fallos de fetch de `product_data.json`
   - errores de service worker
4. Definir mitigación temporal:
   - rollback rápido
   - kill-switch de SW (`ebano-sw-disabled`)
   - degradación controlada

## Checklist de diagnóstico

1. Build vigente en `build/` consistente.
2. `npm run build` reproduce localmente el estado esperado.
3. Cachés del service worker no están sirviendo assets obsoletos.
4. `data/product_data.json` mantiene contrato válido.

## Comunicación mínima

1. estado actual (qué falla)
2. impacto (usuarios/rutas)
3. acción inmediata tomada
4. ETA para siguiente actualización

## Cierre de incidente

1. validar corrección con smoke y pruebas relevantes
2. documentar causa raíz y prevención
3. enlazar PR/commit de fix y rollback
