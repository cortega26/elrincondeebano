# Snapshots etiquetados

Este directorio almacena capturas de pantalla generadas por `tools/snapshot-site.mjs`. Cada archivo PNG sigue el patrón `snapshot-<tag>-<timestamp>.png` y el manifiesto `manifest.json` mantiene un historial ordenado (entrada más reciente primero) con los metadatos:

- `tag`: identificador sanitizado usado para agrupar el snapshot.
- `url`: origen que se visitó al capturar la imagen.
- `file`: ruta relativa al repositorio donde quedó guardada la captura.
- `capturedAt`: marca temporal ISO‑8601 de cuando se generó la evidencia.

Sube únicamente archivos generados por el script para conservar consistencia.

Para sustituir una captura previa (por ejemplo, cuando se desea mantener solo la más reciente de una etiqueta), ejecuta el script
con `--replace-last`. Esto elimina la última entrada registrada en `manifest.json` y borra el artefacto asociado antes de generar
la nueva captura, manteniendo el historial limpio y cronológicamente ordenado.
