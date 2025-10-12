# Snapshots etiquetados

Este directorio almacena capturas de pantalla generadas por `tools/snapshot-site.mjs`. Cada archivo PNG sigue el patrón `snapshot-<tag>-<timestamp>.png` y el manifiesto `manifest.json` mantiene un historial ordenado (entrada más reciente primero) con los metadatos:

- `tag`: identificador sanitizado usado para agrupar el snapshot.
- `url`: origen que se visitó al capturar la imagen.
- `file`: ruta relativa al repositorio donde quedó guardada la captura.
- `capturedAt`: marca temporal ISO‑8601 de cuando se generó la evidencia.

Sube únicamente archivos generados por el script para conservar consistencia.
