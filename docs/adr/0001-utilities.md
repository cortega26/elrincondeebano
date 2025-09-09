# 0001 - Utilidades para imágenes y logging

## Estado
Aceptado

## Contexto
Se requieren ayudas simples para generar URLs de imágenes servidas por Cloudflare y para registrar eventos en consola con formato consistente.

## Decisión
Se implementaron `cfimg` para componer transformaciones de Cloudflare y `log` junto a `createCorrelationId` para emitir registros JSON.

## Consecuencias
Centralizar estas funciones facilita su documentación y evita duplicar lógica al agregar nuevas características de imagen o logging.
