# Plan 012: Unificar políticas CSP — eliminar divergencia header vs meta y añadir hashes Cloudflare faltantes

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.

> **Drift check (run first)**: `git diff --stat 4751633..HEAD -- tools/security-header-policy.mjs src/js/csp.js infra/cloudflare/edge-security-headers/worker.mjs`
> Si los archivos cambiaron, compara excerpts contra código vivo; si hay mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: plan 003 (eliminación de `window.__CSP_NONCE__`)
- **Category**: security
- **Planned at**: commit `4751633`, 2026-06-14

## Why this matters

El sitio tiene **dos políticas CSP** que divergen:

1. **CSP header** (servido por Cloudflare Worker, `tools/security-header-policy.mjs:13-37`): restrictivo — `script-src 'self' https://static.cloudflareinsights.com 'sha256-...'`. Usa hash para inline scripts.

2. **CSP meta tag** (inyectado por `src/js/csp.js:26-38`): más laxo — `script-src 'self' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com ... 'nonce-...'`. Añade CDNs innecesarios, usa nonce (predecible, expuesto en `window`), y permite `style-src` con CDNs externos.

**Problemas concretos (SEC-01, SEC-03)**:

- Los CDNs en el meta tag (`cdn.jsdelivr.net`, `cdnjs.cloudflare.com`) son vectores de bypass CSP (JSONP endpoints) y no son necesarios — la app no los usa.
- El nonce del meta tag está expuesto en `window.__CSP_NONCE__` (plan 003).
- El header CSP bloquea los scripts inline de Cloudflare Insights porque los hashes en la política (`SvXHAI...`) no coinciden con los hashes reales de los scripts inyectados (`FmzvnK...` y `XT4FS6...`).
- La doble política crea confusión sobre cuál es la fuente de verdad.

## Current state

### CSP header (Cloudflare Worker)

```javascript
// tools/security-header-policy.mjs:13-37
export const CONTENT_SECURITY_POLICY_DIRECTIVES = Object.freeze([
  ['default-src', ["'self'"]],
  ['base-uri', ["'self'"]],
  ['object-src', ["'none'"]],
  ['frame-ancestors', ["'none'"]],
  [
    'script-src',
    [
      "'self'",
      'https://static.cloudflareinsights.com',
      "'sha256-SvXHAIPcJdE6zuH0y1Xb0AUS/ZJCmBwN7SfMfiEj578='", // ← solo un hash
    ],
  ],
  ['style-src', ["'self'"]],
  ['img-src', ["'self'", 'data:', 'https:']],
  ['font-src', ["'self'", 'data:']],
  [
    'connect-src',
    ["'self'", 'https://cloudflareinsights.com', 'https://static.cloudflareinsights.com'],
  ],
  ['manifest-src', ["'self'"]],
  ['worker-src', ["'self'"]],
  ['form-action', ["'self'"]],
  ['upgrade-insecure-requests', []],
]);
```

### CSP meta tag (cliente)

```javascript
// src/js/csp.js:26-38
const cspPolicy = `
  default-src 'self';
  script-src 'self' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://static.cloudflareinsights.com 'nonce-${cspNonce}';
  style-src 'self' https://cdn.jsdelivr.net https://fonts.googleapis.com 'nonce-${cspNonce}';
  img-src 'self' data: https:;
  font-src 'self' https://fonts.gstatic.com https://cdn.jsdelivr.net;
  connect-src 'self' https://cloudflareinsights.com https://cdn.jsdelivr.net;
  frame-src 'none';
  object-src 'none';
  base-uri 'self';
  form-action 'self';
  upgrade-insecure-requests;
`;
```

### Reportes de CSP violations

`reports/live-contract/browser.json` captura errores CSP en cada carga de página con hashes `FmzvnK...` y `XT4FS6...` que no están en la política.

## Commands

| Purpose   | Command                                    | Expected on success |
| --------- | ------------------------------------------ | ------------------- |
| Typecheck | `npm run typecheck`                        | exit 0              |
| Tests     | `npm test`                                 | all pass            |
| Lint      | `npm run lint`                             | exit 0              |
| CSP test  | `node test/security-header-policy.test.js` | pasa                |

## Scope

**In scope**:

- `tools/security-header-policy.mjs` — añadir hashes Cloudflare faltantes, remover CDNs del header si existen
- `src/js/csp.js` — alinear meta tag con header CSP (o eliminar meta tag por completo)
- `test/security-header-policy.test.js` — actualizar hashes esperados
- `test/csp.policy.hardening.test.js` — verificar que las políticas están alineadas

**Out of scope**:

- `infra/cloudflare/edge-security-headers/worker.mjs` — el worker ya aplica el header CSP. Solo se modifica si la lógica de sanitización necesita ajuste.
- El reporte `reports/live-contract/browser.json` — es output de monitoreo, no se modifica.
- Cambios en otras security headers.

## Git workflow

- Branch: `advisor/012-unify-csp-policies`
- Commit messages: `security: align client-side CSP meta tag with server header, add missing Cloudflare script hashes`
- No push/PR sin indicación.

## Steps

### Step 1: Identificar los hashes de los scripts Cloudflare bloqueados

1. Revisar `reports/live-contract/browser.json` para extraer los hashes reportados.
2. Alternativa: ejecutar el build y calcular los hashes de los scripts inline que Cloudflare inyecta:
   ```bash
   npm run build
   # Buscar scripts inline en astro-poc/dist/
   grep -r "cloudflareinsights.com" astro-poc/dist/ || echo "Scripts inyectados por Cloudflare, no en build"
   ```
3. Si no se pueden obtener del build (los inyecta Cloudflare en el edge), usar los hashes del reporte live-contract.

**NOTA**: Los hashes exactos (`FmzvnK...` y `XT4FS6...`) deben verificarse contra el reporte real. Si el reporte no está disponible, usar los valores del excerpt del subagente como punto de partida y verificar con `npm run monitor:live-contract`.

**Verify**: `node -e "console.log('hashes identificados')"` → documentar los hashes encontrados.

### Step 2: Añadir hashes faltantes al CSP header

En `tools/security-header-policy.mjs`, añadir los hashes faltantes a `script-src`:

```javascript
'script-src',
[
  "'self'",
  'https://static.cloudflareinsights.com',
  "'sha256-SvXHAIPcJdE6zuH0y1Xb0AUS/ZJCmBwN7SfMfiEj578='",
  "'sha256-FmzvnK...'",  // ← hash del reporte live-contract
  "'sha256-XT4FS6...'",  // ← hash del reporte live-contract
],
```

**Verify**: `node test/security-header-policy.test.js` → actualizar el test si espera un número exacto de hashes

### Step 3: Alinear o eliminar CSP meta tag

**Opción A (recomendada)**: Eliminar `src/js/csp.js` por completo. El CSP header del Cloudflare Worker es suficiente. El meta tag es redundante y añade superficie de ataque.

Si se elige Opción A:

1. Eliminar `src/js/csp.js`.
2. Eliminar cualquier import o referencia a `csp.js` en `src/js/main.js` o donde se cargue.
3. Actualizar tests que referencien `csp.js`.

**Opción B**: Alinear el meta tag con el header:

1. Remover CDNs innecesarios (`cdn.jsdelivr.net`, `cdnjs.cloudflare.com`, `fonts.googleapis.com`, `fonts.gstatic.com`).
2. Usar los mismos hashes que el header (no nonce).
3. Mantener directivas consistentes.

Por defecto aplicar **Opción A**. Si `npm test` revela dependencias críticas en `csp.js`, cambiar a Opción B.

**Verify**: `npm run build` → exit 0. `npm test` → all pass.

### Step 4: Verificar que el sanitizador de HTML no interfiere

`tools/security-header-policy.mjs:62-68` tiene una regla `cloudflare-inline-insights-bootstrap` que intenta sanitizar los scripts inline de Cloudflare. Si el CSP header ahora permite estos scripts (con los hashes correctos), la sanitización es contraproducente — permite los scripts pero luego los elimina del HTML.

Verificar si el sanitizador (`sanitizePublicHtmlEdgeSurface`) se ejecuta en el pipeline de deploy. Si es así, considerar:

1. Eliminar la regla `cloudflare-inline-insights-bootstrap` de `HTML_EDGE_SURFACE_RULES`, o
2. Mantenerla si el propósito es eliminar el bootstrap script Y el CSP no debe permitirlo.

Si se añadieron los hashes en el step 2, **mantener la regla de sanitización** (los hashes son para el caso donde Cloudflare inyecta scripts a pesar de la sanitización).

### Step 5: Validación completa

```bash
npm run typecheck && npm run lint && npm test && node test/security-header-policy.test.js
```

## Test plan

1. `test/security-header-policy.test.js`: actualizar para reflejar los nuevos hashes.
2. `test/csp.policy.hardening.test.js`: verificar que las directivas CSP del header son correctas.
3. Si `csp.js` se elimina, remover tests que dependan de `window.__CSP_NONCE__`.

## Done criteria

- [ ] `npm run typecheck` exits 0
- [ ] `npm test` exits 0
- [ ] `node test/security-header-policy.test.js` exits 0
- [ ] CSP header incluye TODOS los hashes necesarios para Cloudflare scripts
- [ ] CSP meta tag (`src/js/csp.js`) está eliminado o alineado con el header
- [ ] No hay directivas CSP divergentes entre header y meta tag
- [ ] Los test de CSP reflejan la política unificada

## STOP conditions

- Si no se pueden obtener los hashes reales de los scripts Cloudflare (el reporte live-contract no está disponible o no es parseable).
- Si eliminar `csp.js` rompe funcionalidad en navegadores que no reciben el header CSP (ej: acceso directo a GitHub Pages sin Cloudflare).
- Si `npm run monitor:live-contract` reporta nuevas violaciones CSP después del cambio.
- Si la sanitización de HTML (`sanitizePublicHtmlEdgeSurface`) elimina scripts necesarios para Cloudflare analytics.

## Maintenance notes

- **Una sola fuente de verdad**: Después de este plan, `tools/security-header-policy.mjs` es la única definición de CSP. Cualquier cambio en la política debe hacerse aquí.
- Los hashes SHA-256 deben recalcularse si Cloudflare cambia sus scripts de insights.
- Si se añaden nuevos scripts inline al build (ej: analytics, A/B testing), sus hashes deben añadirse a `CONTENT_SECURITY_POLICY_DIRECTIVES`.
- El monitoreo live-contract (`npm run monitor:live-contract`) debe correrse después de cada deploy para verificar que no hay nuevas violaciones CSP.
