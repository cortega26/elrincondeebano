# Prompt 7 - Performance (2026-02-13)

## Objetivo

Mejorar performance sin regresiones de UX/SEO y con validación cuantitativa.

## Baseline usado

1. Lighthouse inicial (Prompt 7 baseline):
   - `reports/lighthouse/prompt7-baseline-summary.json`
2. Páginas medidas:
   - `/index.html`
   - `/pages/bebidas.html`
3. Presets:
   - `mobile`
   - `desktop`

## Incidente detectado y corrección

1. Se probó diferir `style.min.css` con `media="print" + data-defer`.
2. Resultado: regresión severa de CLS (~0.40) en ambas páginas.
3. Acción correctiva aplicada:
   - Se eliminó defer de `style.min.css` en templates.
   - Se removió la activación diferida asociada en `src/js/csp.js`.
4. Estado posterior: CLS volvió a `0` en todas las mediciones.

## Optimización segura conservada

1. Se mantiene `preload` + stylesheet render-blocking por ruta:
   - landing: `/dist/css/style.min.css?v=100`
   - categorías: `/dist/css/style.category.min.css?v=100`

## Reforma estructural aplicada

1. Se reemplazó la generación de CSS global en `tools/build.js` por un pipeline en dos pasos:
   - compilación intermedia (`style.bundle.css`) desde `assets/css/app.css`;
   - purgado de CSS no usado con `PurgeCSS` sobre plantillas EJS (incluyendo parciales) y scripts de `src/js/**`.
2. Se añadió safelist conservadora para estados dinámicos críticos de Bootstrap/UI (`show`, `collapse`, `collapsing`, `offcanvas*`, `dropdown*`, `navbar*`, etc.).
3. Se mantiene render-blocking de `critical.min.css` + `style.min.css` (sin `defer`/`media=print` para `style.min.css`).
4. Dependencia agregada:
   - `purgecss` (devDependency).

## Refuerzo estructural adicional (split por ruta)

1. Se agregó split de CSS por tipo de página en `tools/build.js`:
   - `style.min.css` para landing (`templates/index.ejs`).
   - `style.category.min.css` para categorías (`templates/category.ejs`).
2. `templates/category.ejs` ahora usa `style.category.min.css` como stylesheet principal (render-blocking).
3. El Service Worker precachea explícitamente ambos bundles:
   - `/dist/css/style.min.css`
   - `/dist/css/style.category.min.css`
4. Se actualizó guardrail anti-flicker:
   - `test/noFlicker.stylesheetLoading.test.js` ahora valida el href correcto por plantilla y que no exista defer (`media="print"` / `data-defer`).

## Refuerzo JS no crítico (idle init)

1. Se redujo trabajo en el arranque inicial de `src/js/main.js`:
   - se mantienen inmediatas solo inicializaciones críticas de interacción;
   - se difieren por `requestIdleCallback` (o fallback `setTimeout`) módulos no críticos:
     - `enhancements.js`
     - `perf.js`
     - `pwa.js`
     - `seo.js` (metadata/structured data client-side)
     - `observability.mjs`
2. Objetivo:
   - bajar presión de CPU en la ruta crítica de render;
   - preservar estabilidad visual (sin tocar estrategia de carga CSS render-blocking).

## Resultados (baseline vs reforma estructural)

Fuente:
1. `reports/lighthouse/prompt7-baseline-summary.json`
2. `reports/lighthouse/prompt7-structural-css-summary.json`

| Página | Preset | Perf baseline | Perf estructural | LCP baseline | LCP estructural | CLS baseline | CLS estructural | `unused-css-rules` baseline | `unused-css-rules` estructural |
|---|---|---:|---:|---:|---:|---:|---:|
| `/index.html` | mobile | 63 | 66 | 9454 ms | 7855 ms | 0.00 | 0.00 | ~1200 ms | ~310 ms |
| `/index.html` | desktop | 63 | 66 | 8937 ms | 8785 ms | 0.00 | 0.00 | n/a | ~450 ms |
| `/pages/bebidas.html` | mobile | 71 | 74 | 6910 ms | 6981 ms | 0.00 | 0.00 | ~1050 ms | ~450 ms |
| `/pages/bebidas.html` | desktop | 71 | 74 | 7209 ms | 6980 ms | 0.00 | 0.00 | n/a | ~450 ms |

## Bundle size (build/dist)

1. Antes:
   - `JS_TOTAL_BYTES=98078`
   - `CSS_TOTAL_BYTES=246804`
2. Después:
   - `STYLE_MIN_BYTES=89761`
   - `CRITICAL_MIN_BYTES=4321`
   - `JS_TOTAL_BYTES=97942`
   - `CSS_TOTAL_BYTES=94082`

## Oportunidades observadas (Lighthouse)

1. `unused-css-rules` cayó de ~1.0s-1.2s a ~0.31s-0.45s.
2. Oportunidad residual principal: `unused-javascript` (home ~150ms; categorías ~300ms).

## Verificación obligatoria ejecutada

1. `npm run lint` ✅
2. `npm test` ✅
3. `npm run build` ✅
4. Lighthouse local 2 páginas x 2 presets ✅
5. Check explícito anti-flicker en landing:
   - `reports/lighthouse/prompt7-landing-no-flicker-check.json`
   - `CLS=0` en `mobile` y `desktop`.
6. E2E anti-flicker:
   - `npx playwright test test/e2e/flicker.spec.ts` ✅ (`6/6`).
7. Auditoría de seguridad de deps de producción:
   - `npm audit --omit=dev` ✅ (`0` vulnerabilidades).

## Guardrail anti-flicker agregado

1. Test nuevo: `test/noFlicker.stylesheetLoading.test.js`.
2. Regla: los stylesheets principales (`style.min.css` en landing y `style.category.min.css` en categorías) no pueden volver a modo diferido (`media="print"` ni `data-defer`).
3. Integrado en suite principal vía `test/run-all.js`.

## Mediciones tras split por ruta

Fuente:
1. `reports/lighthouse/prompt7-structural-css-summary.json`
2. `reports/lighthouse/prompt7-route-split-css-summary.json`

| Página | Preset | `unused-css-rules` estructural | `unused-css-rules` split por ruta | CLS estructural | CLS split por ruta |
|---|---|---:|---:|---:|---:|
| `/index.html` | mobile | ~310 ms | ~450 ms | 0.00 | 0.00 |
| `/index.html` | desktop | ~450 ms | ~300 ms | 0.00 | 0.00 |
| `/pages/bebidas.html` | mobile | ~450 ms | ~300 ms | 0.00 | 0.00 |
| `/pages/bebidas.html` | desktop | ~450 ms | ~450 ms | 0.00 | 0.00 |

Nota: Lighthouse mantiene variación entre corridas; el split por ruta no introduce regresión visual (CLS se mantiene en `0`).

## Mediciones tras idle init de módulos no críticos

Fuente:
1. `reports/lighthouse/prompt7-route-split-css-summary.json`
2. `reports/lighthouse/prompt7-idle-init-summary.json`

| Página | Preset | Perf antes (route split) | Perf después (idle init) | LCP antes | LCP después | CLS antes | CLS después | `unused-javascript` después |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| `/index.html` | mobile | 66 | 65 | 8787 ms | 8785 ms | 0.00 | 0.00 | ~150 ms |
| `/index.html` | desktop | 66 | 65 | 8865 ms | 8783 ms | 0.00 | 0.00 | ~150 ms |
| `/pages/bebidas.html` | mobile | 74 | 74 | 6906 ms | 7057 ms | 0.00 | 0.00 | ~0 ms |
| `/pages/bebidas.html` | desktop | 74 | 74 | 6980 ms | 7056 ms | 0.00 | 0.00 | ~0 ms |

Nota: cambios dentro de variación normal de Lighthouse; no se observó regresión visual (CLS estable en `0`).

## Reforma estructural JS (intent-driven lazy boot)

1. Se desacopló la carga del runtime principal:
   - `src/js/main.js` dejó de importar `./script.mjs` de forma estática.
   - `script.mjs` ahora se carga dinámicamente por intención de uso (`click`/`focus`/`teclado` en controles de catálogo/carrito), visibilidad de catálogo y fallback por `idle`.
2. Se añadió preservación de primer click:
   - si el usuario interactúa antes de que cargue el runtime, se captura y se re-dispara el click tras inicialización para evitar pérdida de acción.
3. Se añadió cobertura e2e para este comportamiento:
   - `test/e2e/first-interaction-cart.spec.ts`.

## Mediciones tras intent-driven lazy boot (home)

Fuente:
1. `reports/lighthouse/prompt7-idle-init-summary.json`
2. `reports/lighthouse/prompt7-runtime-intent-summary.json`

| Página | Preset | `unused-javascript` antes (idle init) | `unused-javascript` después (intent boot) | Perf antes | Perf después | LCP antes | LCP después | CLS antes | CLS después |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `/index.html` | mobile | ~150 ms | 0 ms | 65 | 67 | 8785 ms | 8496 ms | 0.00 | 0.00 |
| `/index.html` | desktop | ~150 ms | 0 ms | 65 | 67 | 8783 ms | 8491 ms | 0.00 | 0.00 |

## Impacto en bundle JS inicial

1. Antes del cambio:
   - `build/dist/js/script.min.js` ~53.8 KB.
2. Después del cambio:
   - `build/dist/js/script.min.js` ~5.9 KB (entry inicial).
   - runtime principal se desplaza a chunk diferido (`build/dist/js/script-*.js`).

## Riesgos restantes

1. El purgado depende de safelist: cambios futuros en clases dinámicas pueden requerir actualizar reglas de PurgeCSS.
2. El score de Lighthouse presenta variabilidad entre corridas, por lo que mejoras pequeñas deben validarse en múltiples muestras.
3. `unused-css-rules` sigue siendo una oportunidad, especialmente por estilos comunes de Bootstrap que aún se conservan por compatibilidad.
