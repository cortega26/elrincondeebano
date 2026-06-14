# Plan 003: Eliminar innerHTML en notificación de stock y exposición de CSP nonce

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.

> **Drift check (run first)**: `git diff --stat 4751633..HEAD -- astro-poc/src/scripts/storefront.js src/js/csp.js`
> Si los archivos cambiaron, compara excerpts contra código vivo; si hay mismatch, STOP.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (independiente de otros planes, pero si plan 001 toca storefront.js, ejecutar 001 primero)
- **Category**: security
- **Planned at**: commit `4751633`, 2026-06-14

## Why this matters

Dos problemas de seguridad de fácil solución:

1. **SEC-04 — innerHTML con datos de producto**: `showFavoritesStockNotification` (`storefront.js:266-282`) construye HTML con nombres de producto interpolados directamente en `innerHTML`. Los nombres vienen de `data-product-name` en el DOM, que se generan en build-time desde `product_data.json`. Si un nombre de producto contiene HTML (por compromiso del admin tool o inyección en los datos), se ejecuta en el navegador de cada usuario.

2. **SEC-02 — CSP nonce expuesto en `window.__CSP_NONCE__`**: `src/js/csp.js:21` escribe el nonce CSP a `window.__CSP_NONCE__`. Tres módulos legacy lo leen (`enhancements.js`, `a11y.js`, `seo.js`). Cualquier script en la página puede leer el nonce y crear tags `<script>` válidos, derrotando completamente la protección nonce-based CSP.

## Current state

### SEC-04: innerHTML con datos de producto

```javascript
// storefront.js:266-282
const names = inStock
  .map(function (p) {
    return p.name; // ← viene de el.dataset.productName (línea ~246)
  })
  .join(', ');
banner.innerHTML =
  '<div class="d-flex align-items-center gap-2 mb-1"><strong>¡Productos disponibles de nuevo!</strong></div>' +
  '<div class="stock-notification-body">' +
  names + // ← interpolación directa en HTML
  ' ' +
  (inStock.length === 1 ? 'está' : 'están') +
  ' disponible' +
  (inStock.length === 1 ? '' : 's') +
  '. ¡Agrégal' +
  (inStock.length === 1 ? 'o' : 'os') +
  ' a tu pedido!</div>' +
  '<button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Cerrar"></button>';
```

### SEC-02: CSP nonce expuesto

```javascript
// src/js/csp.js:19-24
const cspNonce = generateNonce();
try {
  window.__CSP_NONCE__ = cspNonce; // ← expone el nonce globalmente
} catch (error) {
  // Ignore if the CSP nonce cannot be attached to window.
}
```

Módulos que leen `window.__CSP_NONCE__`:

- `src/js/modules/enhancements.js:7-8`
- `src/js/modules/a11y.js:14-15`
- `src/js/modules/seo.js:153-154`

### Convenciones

- El proyecto ya usa `createElement` + `textContent` en `storefront.js:77-91` para construcción segura de DOM.
- ESLint zero-warning, Prettier `semi: true`, `singleQuote: true`.
- El código legacy en `src/js/` está en proceso de migración a `astro-poc/`.

## Commands

| Purpose   | Command             | Expected on success |
| --------- | ------------------- | ------------------- |
| Typecheck | `npm run typecheck` | exit 0              |
| Tests     | `npm test`          | all pass            |
| Lint      | `npm run lint`      | exit 0              |
| Format    | `npm run format`    | exit 0              |

## Scope

**In scope**:

- `astro-poc/src/scripts/storefront.js` — `showFavoritesStockNotification` (líneas ~244-286)
- `src/js/csp.js` — eliminar `window.__CSP_NONCE__` o reemplazar por módulo scoped

**Out of scope**:

- `src/js/modules/enhancements.js`, `a11y.js`, `seo.js` — código legacy. Si rompen al quitar `window.__CSP_NONCE__`, documentarlo como STOP condition. El fix de estos módulos es opcional (están en migración).
- La política CSP en sí (headers, meta tags) — eso es plan 012.
- Cualquier cambio en `tools/security-header-policy.mjs`.

## Git workflow

- Branch: `advisor/003-fix-innerhtml-and-csp-nonce`
- Commit messages: `fix: replace innerHTML with safe DOM construction in stock notification`
- No push/PR sin indicación.

## Steps

### Step 1: Reemplazar innerHTML por safe DOM construction

En `storefront.js`, reescribir `showFavoritesStockNotification` usando `createElement` (ya definida en línea 77) y `textContent`:

```javascript
function showFavoritesStockNotification(inStock) {
  if (!inStock || inStock.length === 0) return;

  const banner = createElement('div', {
    className: 'alert alert-success alert-dismissible fade show stock-notification-banner',
    attrs: { id: 'stock-notification-banner', role: 'alert', 'aria-live': 'polite' },
  });

  const headerRow = createElement('div', { className: 'd-flex align-items-center gap-2 mb-1' });
  const strong = document.createElement('strong');
  strong.textContent = '¡Productos disponibles de nuevo!';
  headerRow.appendChild(strong);
  banner.appendChild(headerRow);

  const body = createElement('div', { className: 'stock-notification-body' });
  const names = inStock
    .map(function (p) {
      return p.name;
    })
    .join(', ');
  const verb = inStock.length === 1 ? 'está' : 'están';
  const plural = inStock.length === 1 ? '' : 's';
  const pronoun = inStock.length === 1 ? 'o' : 'os';
  body.textContent =
    names + ' ' + verb + ' disponible' + plural + '. ¡Agrégal' + pronoun + ' a tu pedido!';
  banner.appendChild(body);

  const closeBtn = createElement('button', {
    className: 'btn-close',
    attrs: { type: 'button', 'data-bs-dismiss': 'alert', 'aria-label': 'Cerrar' },
  });
  banner.appendChild(closeBtn);

  const target = document.querySelector('main') || document.body;
  target.insertBefore(banner, target.firstChild);
}
```

**Verify**: `npm run lint` → exit 0

### Step 2: Eliminar exposición de CSP nonce en window

En `src/js/csp.js`:

**Opción A (recomendada)**: Eliminar `window.__CSP_NONCE__`. Cambiar la línea 21:

```javascript
// Antes:
window.__CSP_NONCE__ = cspNonce;
// Después:
// El nonce se usa solo en este script; no se expone globalmente.
// Los módulos que necesiten nonce deben recibirlo por parámetro o usar el meta tag directamente.
```

**Opción B**: Si los módulos legacy son críticos, encapsular el nonce en un closure:

```javascript
const cspNonce = generateNonce();
// No exponer en window. Si los módulos legacy lo requieren,
// que lean el nonce del meta tag:
// document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content
```

Elegir Opción A. Si `npm test` falla porque los tests de `enhancements.js`, `a11y.js`, o `seo.js` dependen de `window.__CSP_NONCE__`, aplicar Opción B para esos módulos (inyectar nonce sin window global).

**Verify**: `npm test` → all pass. `grep -rn "__CSP_NONCE__" src/` no encuentra ocurrencias fuera de `csp.js`.

### Step 3: Validación completa

```bash
npm run typecheck && npm run lint && npm test
```

**Verify**: exit 0 en todos.

## Test plan

### Para SEC-04

Añadir a `test/storefront-state.spec.js` o crear un test que verifique que el banner construido no contiene HTML injection:

```javascript
it('stock notification banner uses textContent, not innerHTML', () => {
  // Simular DOM con jsdom
  document.body.innerHTML = '<main></main>';
  const inStock = [{ id: '1', name: '<img src=x onerror=alert(1)>' }];
  showFavoritesStockNotification(inStock);
  const banner = document.getElementById('stock-notification-banner');
  expect(banner.innerHTML).not.toContain('<img');
  expect(banner.textContent).toContain('<img src=x onerror=alert(1)>');
});
```

### Para SEC-02

Verificar que `window.__CSP_NONCE__` no existe después de cargar `csp.js`:

```javascript
it('does not expose CSP nonce on window', () => {
  // Este test asume que csp.js se ejecutó
  expect(window.__CSP_NONCE__).toBeUndefined();
});
```

## Done criteria

- [ ] `npm run typecheck` exits 0
- [ ] `npm run lint` exits 0
- [ ] `npm test` exits 0
- [ ] `grep -rn "innerHTML" astro-poc/src/scripts/storefront.js` no encuentra ocurrencias en `showFavoritesStockNotification`
- [ ] `grep -rn "__CSP_NONCE__" src/` retorna solo ocurrencias en comentarios o en `csp.js` (si se usa internamente)
- [ ] No files outside the in-scope list are modified

## STOP conditions

- Si `showFavoritesStockNotification` no coincide con el excerpt.
- Si `window.__CSP_NONCE__` es requerido por código en `astro-poc/` (no legacy) — reportar qué archivos.
- Si los tests existentes de `a11y.js`, `enhancements.js`, o `seo.js` rompen y no se pueden adaptar con la Opción B.
- Si un paso de verificación falla dos veces.

## Maintenance notes

- `showFavoritesStockNotification` es parte del Spike 010 (notificaciones de stock). Si este feature se promueve de prototype a producción (plan 007), el banner debe seguir usando construcción segura.
- Si se añade internacionalización (i18n), mover los strings concatenados a un mapa de templates por locale.
- El meta tag CSP del lado cliente (`src/js/csp.js`) debería eventualmente ser eliminado y depender solo del header CSP del Cloudflare Worker (plan 012).
