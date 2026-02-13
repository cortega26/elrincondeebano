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
5. Iteración adicional UX/A11y sin regresiones (Prompt 8)
   - `src/js/main.js`
     - Se preserva también la primera activación por teclado (`Enter`/`Espacio`) durante lazy boot del runtime, con replay de interacción.
   - `assets/css/style.css`
     - Se agregaron estilos consistentes de `:focus-visible` para controles interactivos (links, botones, inputs, selects, textarea).
     - Se añadió realce de foco en `#cart-icon` y `.dropdown-item`.
   - `templates/partials/navbar.ejs`
     - `#cart-count` ahora expone región viva accesible (`aria-live="polite"`, `aria-atomic="true"`).
   - `src/js/modules/cart.mjs`
     - Etiqueta accesible del contador de carrito en español con singular/plural (`1 producto`, `N productos`).
     - Etiqueta de item de carrito en español (`Producto en carrito: ...`).
   - `src/js/modules/ui-components.mjs` y `src/js/modules/catalog-manager.mjs`
     - `aria-label` de acciones de cantidad y botón agregar normalizadas a español.
   - `templates/index.ejs` y `templates/category.ejs`
     - Se añadió `og:site_name` para consistencia SEO social.
   - Nuevo e2e de teclado:
     - `test/e2e/keyboard-navigation.spec.ts` (skip link, dropdown por teclado, carrito por teclado).

## Priorización de hallazgos UX/UI

### P0 (aplicado)

1. Skip link faltante en páginas de categoría.
2. `og:url` de categoría apuntando al home en lugar de URL canónica de la categoría.
3. Inconsistencia visual en selector de orden (`form-control` vs `form-select`).
4. URL HTTP en structured data de tienda.

### P1 (pendiente)

1. Validar copy y jerarquía en estados vacíos/errores por categoría para mantener tono consistente.
2. Extender cobertura e2e de teclado al flujo completo de checkout (selección método de pago + envío).

### P2 (pendiente)

1. Afinar micro-copy de campos de filtro y orden para mayor claridad contextual por categoría.
2. Unificar estrategia de snippets OG/Twitter por vertical con imágenes dedicadas por categoría.

## Verificación ejecutada

1. Lint: `eslint .` ✅
2. Test node suite + Vitest: `npm test` ✅
3. Build completo + verificación de assets SW: `npm run build` ✅
4. E2E smoke completo: `npm run test:e2e` ✅
   - Resultado: `26 passed`, `12 skipped`
5. E2E keyboard específico: `npx playwright test test/e2e/keyboard-navigation.spec.ts` ✅
   - Resultado: `1 passed`, `1 skipped` (skip esperado en mobile por diseño de suite)
6. Cypress smoke navegación: `npm run test:cypress` ✅
   - Resultado: `2 passing`

## Riesgos restantes

1. Cobertura de teclado aún no incluye flujo completo de checkout (solo navegación + carrito).
2. Oportunidades de micro-copy y consistencia editorial por categoría siguen pendientes (P1/P2).
3. Se mantiene riesgo operativo de ejecutar build y e2e en paralelo sobre el mismo `build/`; las verificaciones finales se ejecutaron en secuencia para evitar carreras.
