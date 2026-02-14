# Migration Coverage Matrix (Phase 1 Refresh)

Fecha de actualización: 2026-02-14
PR de evidencia: https://github.com/cortega26/elrincondeebano/pull/216
Verification SHA: `2168728cf2fca8eca0446bf4716e51abc946ef5a`

## Resumen

- El estado pasó de NO-GO crítico a **casi listo**.
- La mayoría de brechas de paridad fueron cerradas.
- Queda **1 regresión funcional**: falta `/pages/offline.html` en `astro-poc/dist`.

## Matriz Legacy -> Astro

| Área | Legacy | Astro equivalente | Estado | Evidencia |
|---|---|---|---|---|
| Home route | `/` y `/index.html` | `/` y `/index.html` | ✅ | `astro-poc/src/pages/index.astro`; e2e Astro smoke en verde. |
| Category routing contract | `/pages/<slug>.html` | `/pages/<slug>.html` + `/c/<slug>/` + `/c/<key>/` | ✅ | `astro-poc/src/pages/pages/[slug].html.astro`, `astro-poc/src/pages/c/[category].astro`, `astro-poc/scripts/postbuild-legacy-pages.mjs`. |
| Category coverage count | categorías activas del registry | mismas categorías activas | ✅ | `active_categories=18`, `legacy_category_pages=18`, incluye `pages/e.html`. |
| Product detail | sin ruta dedicada | `/p/<sku>/` | ✅ | `astro-poc/src/pages/p/[sku].astro`; `test:e2e:astro` en verde. |
| Navbar / taxonomy navigation | dinámico por registry | dinámico por registry | ✅ | `astro-poc/src/components/Navbar.astro` usa `legacyPath` `/pages/*.html`. |
| Search/sort/discount/load-more | presente | presente | ✅ | `CatalogControls.astro` + `storefront.js`; smoke e2e en verde. |
| Cart + checkout WhatsApp | presente | presente | ✅ | `astro-poc/src/scripts/storefront.js`; canary contract tests en verde. |
| SEO canonical/OG/Twitter | presente | presente | ✅ | `astro-poc/src/layouts/BaseLayout.astro`; probes HTML en `dist` muestran tags. |
| `robots.txt` | presente | presente | ✅ | `astro-poc/public/robots.txt` + `astro-poc/dist/robots.txt`. |
| `sitemap.xml` | presente | presente | ✅ | `astro-poc/scripts/postbuild-sitemap.mjs`; `dist/sitemap.xml`. |
| `404.html` dedicado | presente | presente | ✅ | `astro-poc/src/pages/404.astro` + `dist/404.html`. |
| `service-worker.js` | presente | presente | ✅ | `astro-poc/public/service-worker.js` + `dist/service-worker.js`. |
| `app.webmanifest` | presente | presente | ✅ | `astro-poc/public/app.webmanifest` + `dist/app.webmanifest`. |
| Offline fallback route | `/pages/offline.html` | no emitido | ❌ | `Test-Path astro-poc/dist/pages/offline.html = False`. |
| Product data contract output | `/data/product_data.json` | `/data/product_data.json` | ✅ | `astro-poc/scripts/sync-data.mjs`; `dist/data/product_data.json`. |
| CM key/slug contract | key + slug legacy | key + slug adapter | ✅ | `astro-poc/src/lib/catalog.ts` (`resolveCategoryParamToKey`, `getLegacyCategoryPath`, `getCategoryRouteParams`). |
| AVIF fallback support | `<picture>` con AVIF | `<picture>` con AVIF | ✅ | `astro-poc/src/components/ProductCard.astro`, `astro-poc/src/components/ProductDetail.astro`. |
| CI continuity (required workflows) | legacy-oriented | Astro-oriented | ✅ | Hosted runs green: `ci.yml`, `product-data-guard.yml`, `post-deploy-canary.yml`, `static.yml` verification path. |
| Runtime analytics/observability parity fina | hooks legacy existentes | parcial/no verificado end-to-end | ⚠️ | No evidencia completa de parity de eventos legacy en producción. |

## Silent Omissions (Current)

1. ❌ `/pages/offline.html` no existe en `dist`.
2. ⚠️ Paridad detallada de analytics/observability legacy no está completamente verificada en esta auditoría.

## Fix plan for open items

1. Offline route parity (bloqueante)
- Añadir `astro-poc/public/pages/offline.html` (o copiar desde `static/offline.html` en sync/build).
- Verificar:
  - `Test-Path astro-poc/dist/pages/offline.html` -> `True`
  - smoke offline/manual sin regresiones.

2. Observability parity (recomendado)
- Validar eventos críticos en flujo real post-cutover (cart, checkout, errores runtime).
- Añadir evidencia en runbook/observability docs.
