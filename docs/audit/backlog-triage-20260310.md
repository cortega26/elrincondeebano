# Triage de Backlog Vigente (2026-03-10)

## Resumen

Se revisó el backlog documental histórico contra el estado actual del repositorio (`main` en `0b50369`).

Resultado:

1. Hay backlog real todavía abierto.
2. Parte importante del backlog en docs ya quedó resuelta y sólo falta actualizar la documentación.
3. El backlog vigente hoy es más pequeño que el que sugieren los documentos de febrero de 2026.

## Backlog vigente

### 1. Assets huérfanos históricos

- Sigue abierto.
- Evidencia: `npm run guardrails:assets` reporta `77 orphan assets`.
- Fuente de verdad actual: `reports/orphan-assets/latest.json`.
- Estado: no bloquea CI porque está dentro del baseline, pero sigue siendo deuda de limpieza.

### 2. E2E de teclado para checkout completo

- Sigue abierto.
- El test actual cubre navegación por teclado de menú y apertura/cierre del carrito:
  - `test/e2e/keyboard-navigation.spec.ts`
- No cubre todavía:
  - selección de medio de pago
  - validación del error
  - envío del pedido desde teclado

### 3. Logging estructurado en módulos auxiliares

- Sigue abierto parcialmente.
- Persisten `console.warn` o `console.log` en:
  - `src/js/modules/a11y.js`
  - `src/js/modules/pwa.js`
  - `src/js/modules/perf.js`
  - `src/js/modules/enhancements.js`
  - `src/js/script.mjs`
  - `astro-poc/src/scripts/storefront.js`

### 4. Revisión editorial de microcopy por categoría

- Sigue abierta parcialmente.
- Hay estados vacíos ya implementados, pero no existe evidencia clara de una revisión editorial sistemática por categoría.
- Aplica especialmente a:
  - estados vacíos
  - mensajes de filtro
  - consistencia de tono en páginas de categoría

## Backlog resuelto pero no cerrado en docs

### 1. Upgrades mayores de tooling

- Resuelto.
- `package.json` ya usa:
  - `eslint` `^10.0.2`
  - `purgecss` `^8.0.0`

### 2. Contraste de texto secundario

- Resuelto en la implementación actual.
- El token usado hoy es `--text-muted: #4a4f55`, alineado con la remediación documentada.

### 3. Accesibilidad básica del offcanvas del carrito

- Resuelto en gran parte.
- El markup actual ya incluye:
  - `role="dialog"`
  - `aria-modal="true"`
  - heading enfocable
- Además existe manejo de foco/Tab/Escape en:
  - `src/js/modules/a11y.js`

### 4. `nested-interactive` en cards de producto

- Resuelto en la implementación actual.
- Las cards no están envueltas en anchors con botones anidados.
- Evidencia:
  - `templates/index.ejs`
  - `templates/category.ejs`
  - `astro-poc/src/components/ProductCard.astro`

### 5. Canonical / OG / Twitter por categoría

- Resuelto en la implementación actual.
- Evidencia:
  - `templates/category.ejs`
  - `astro-poc/src/layouts/BaseLayout.astro`
  - `test/template.seo-accessibility.test.js`
  - `test/e2e-astro/parity-smoke.spec.ts`

## Backlog dudoso o que conviene reformular

### 1. "typecheck global" como deuda histórica

- La afirmación original quedó desactualizada.
- Existe `npm run typecheck` y hoy pasa en verde.
- Limitación real actual:
  - `tsconfig.typecheck.json` sólo cubre `src/js/utils/**/*.mjs` y `src/js/modules/**/*.mjs`
- Reformulación recomendada:
  - cambiar "typecheck global pendiente" por "ampliar cobertura de typecheck fuera de módulos/utilidades si se desea elevar el estándar".

### 2. "Estados vacíos/errores por categoría" como ausencia total

- Ya no corresponde describirlo como faltante total.
- Existen mensajes de empty state en categorías y Astro.
- Lo pendiente real es calidad editorial, no ausencia funcional.

## Lista corta recomendada

Si se quiere dejar un backlog realista y actual, debería quedar reducido a esto:

1. Reducir baseline de assets huérfanos (`77` actuales).
2. Extender E2E de teclado al checkout completo.
3. Migrar logs heredados (`console.*`) a `log(...)` estructurado.
4. Hacer revisión editorial/microcopy por categoría.
