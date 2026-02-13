# Prompt 8 - UX/UI (2026-02-13)

## Objetivo

Elevar consistencia UX/UI, accesibilidad y SEO sin rediseño destructivo ni regresiones de first paint (flicker/FOUC).

## Cambios aplicados

1. `templates/category.ejs`
   - Se agregó skip link al inicio del `body` para navegación por teclado.
   - Se corrigió `og:url` para que apunte a la URL real de la categoría.
   - Se añadió metadata social de Twitter (`twitter:card`, `twitter:title`, `twitter:description`, `twitter:image`).
   - Se homologó el control de orden a `class="form-select"` para consistencia visual con home.
2. `templates/index.ejs`
   - Se añadió metadata social de Twitter para consistencia SEO/preview.
3. `src/js/modules/seo.js`
   - Se corrigió `Store.url` en JSON-LD a HTTPS.
4. Guardrails de regresión
   - Nuevo test de contrato de plantillas: `test/template.seo-accessibility.test.js`.
   - `test/modules.dom.test.js` ahora valida URL HTTPS en structured data.
   - `test/run-all.js` incluye el nuevo test.

## Priorización de hallazgos UX/UI

### P0 (aplicado)

1. Skip link faltante en páginas de categoría.
2. `og:url` de categoría apuntando al home en lugar de URL canónica de la categoría.
3. Inconsistencia visual en selector de orden (`form-control` vs `form-select`).
4. URL HTTP en structured data de tienda.

### P1 (pendiente)

1. Revisar estados de foco visibles en todos los componentes interactivos del navbar/offcanvas con recorrido teclado completo.
2. Validar copy y jerarquía en estados vacíos/errores por categoría para mantener tono consistente.
3. Añadir prueba e2e específica de navegación por teclado (`Tab`, `Enter`, `Escape`) sobre dropdown y carrito.

### P2 (pendiente)

1. Afinar micro-copy de campos de filtro y orden para mayor claridad contextual por categoría.
2. Revisar metadatos OG de categoría para incluir `og:site_name` y unificar snippets por vertical.

## Verificación ejecutada

1. Lint: `eslint .` ✅
2. Test node suite: `node test/run-all.js` ✅
3. Test Vitest: `vitest run` ✅
4. Build completo + verificación de assets SW ✅
5. E2E smoke:
   - `playwright test test/e2e/navbar-dropdown.spec.ts test/e2e/flicker.spec.ts` ✅
   - Resultado: `16 passed`, `10 skipped` (mobile dropdown smoke marcado como skip por la suite actual)

## Riesgos restantes

1. Validación de accesibilidad de teclado todavía depende mayormente de unit tests y smoke; faltaría un e2e dedicado de keyboard journey.
2. Oportunidades de copy/consistencia visual menores siguen pendientes (P1/P2).
3. Se mantiene riesgo operativo de ejecutar build y e2e en paralelo sobre el mismo `build/`; las verificaciones finales se ejecutaron en secuencia para evitar carreras.
