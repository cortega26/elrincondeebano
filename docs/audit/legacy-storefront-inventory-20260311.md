# Inventario del storefront legacy

Fecha: 2026-03-11

## Decisión operativa

La autoridad pública del storefront vive en `astro-poc/**` y se despliega desde `astro-poc/dist/`. El pipeline EJS en raíz queda clasificado como legado retenido temporalmente para referencia y eventual archivado, pero fuera del path principal de build, deploy y assurance.

## Clasificación

| Superficie                                 | Estado    | Decisión   | Nota operativa                                                                                    |
| ------------------------------------------ | --------- | ---------- | ------------------------------------------------------------------------------------------------- |
| `templates/**`                             | archivado | completado | Movido a `_archive/legacy-storefront/templates/**`.                                               |
| `tools/build.js`                           | archivado | completado | Movido a `_archive/legacy-storefront/tools/build.js`.                                             |
| `tools/build-pages.js`                     | archivado | completado | Movido a `_archive/legacy-storefront/tools/build-pages.js`.                                       |
| `tools/build-index.js`                     | archivado | completado | Movido a `_archive/legacy-storefront/tools/build-index.js`.                                       |
| `tools/build-components.js`                | archivado | completado | Movido a `_archive/legacy-storefront/tools/build-components.js`.                                  |
| `tools/copy-static.js`                     | archivado | completado | Movido a `_archive/legacy-storefront/tools/copy-static.js`.                                       |
| `test/buildIndex.lcp.test.js`              | archivado | completado | Movido a `_archive/legacy-storefront/tests/buildIndex.lcp.test.js`.                               |
| `test/template.seo-accessibility.test.js`  | archivado | completado | Movido a `_archive/legacy-storefront/tests/template.seo-accessibility.test.js`.                   |
| `test/noFlicker.stylesheetLoading.test.js` | archivado | completado | Movido a `_archive/legacy-storefront/tests/noFlicker.stylesheetLoading.test.js`.                  |
| `package.json` -> `ejs`                    | retirado  | completado | Eliminado del package surface activo porque ya no hay consumers en el path de build/test vigente. |

## Controles aplicados en este corte

- `npm test` dejó de ejecutar los tests EJS legacy por defecto.
- El código legacy salió del path activo y quedó archivado bajo `_archive/legacy-storefront/`.
- Se añadió un guardrail que falla si reaparecen `templates/`, `tools/build*.js` o tests legacy en raíz, o si la documentación activa vuelve a tratarlos como superficie vigente.

## Próximo paso recomendado

Mantener `_archive/legacy-storefront/` fuera de cualquier workflow o script canónico. Si en el futuro ya no aporta valor histórico, podrá eliminarse sin tocar el storefront activo.
