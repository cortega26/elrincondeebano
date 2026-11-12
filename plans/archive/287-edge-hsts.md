# Plan 287: HSTS en el edge — cumplir lo que promete el ADR 0004 y que el monitor lo vigile

> **Executor instructions**: Sigue este plan paso a paso. Ejecuta cada
> comando de verificación y confirma el resultado esperado antes de pasar
> al siguiente paso. Si ocurre algo en la sección "STOP conditions",
> detente y reporta — no improvises. Al terminar, actualiza la fila de
> estado de este plan en `plans/README.md` — salvo que un reviewer te haya
> despachado y te haya dicho que mantiene el índice.
>
> **Drift check (run first)**: `git diff --stat 6d0a29af..HEAD -- tools/security-header-policy.mjs infra/cloudflare/edge-security-headers/ test/security-header-policy.test.js test/cloudflare-edge-security-worker.test.js docs/operations/EDGE_SECURITY_HEADERS.md docs/adr/0004-github-pages-cloudflare.md`

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: MED (HSTS queda "pegado" en los navegadores durante `max-age`; ver decisiones fijadas abajo)
- **Depends on**: `plans/280-ci-security-hygiene.md` (el deploy del Worker usa `wrangler` fijado en vez de `npx wrangler` sin versión)
- **Category**: security
- **Planned at**: commit `6d0a29af`, 2026-11-12 (Auditoría 13)

**Decisiones fijadas por el advisor (el dueño puede cambiarlas antes de ejecutar):**
`max-age=31536000` (1 año), **sin** `includeSubDomains`, **sin** `preload`; se emite desde
el Worker (código versionado y monitoreado), no desde el panel de Cloudflare.

## Why this matters

`docs/adr/0004-github-pages-cloudflare.md:8,16` declara que el Worker de
Cloudflare aplica HSTS, pero producción no lo envía
(`curl -sI https://www.elrincondeebano.com/` → CSP y `x-frame-options` sí,
`strict-transport-security` no). La política versionada
(`tools/security-header-policy.mjs`) no lo incluye y el inspector que usan el
canary post-deploy y el monitor en vivo no lo verifica, así que nadie lo
notó. Sin HSTS, la primera visita o una URL `http://` tipeada puede ser
degradada por alguien en la misma red (Wi-Fi pública) y reescribir la
página, incluido el número de WhatsApp de destino de los pedidos.

## Current state

- `tools/security-header-policy.mjs`:
  - líneas 11-17: `SECURITY_HEADER_POLICY = Object.freeze({ 'referrer-policy': …, 'x-content-type-options': 'nosniff', 'x-frame-options': 'DENY', 'permissions-policy': … })` — sin HSTS.
  - líneas 117-122: `buildSecurityHeadersPolicy()` = `{ 'content-security-policy': buildContentSecurityPolicy(), ...SECURITY_HEADER_POLICY }`.
  - líneas 124-~210: `inspectSecurityHeaders(headers)` → `observed` (5 headers), `missing[]`, `invalid[]`; patrón por header:
    ```js
    if (!observed['x-frame-options']) {
      missing.push('x-frame-options');
    } else if (
      normalizeHeaderValue(observed['x-frame-options']).toUpperCase() !==
      SECURITY_HEADER_POLICY['x-frame-options']
    ) {
      invalid.push(`x-frame-options (expected ${SECURITY_HEADER_POLICY['x-frame-options']})`);
    }
    ```
  - Consumidores del inspector: `tools/post-deploy-canary.mjs:160` y `tools/live-contract-monitor.mjs:214`.
- `infra/cloudflare/edge-security-headers/worker.mjs` — `applySecurityHeaders(response, buildSecurityHeadersPolicy())` solo a respuestas `text/html` del host canónico (`shouldApplySecurityHeaders`). Añadir el header a la política lo emite automáticamente.
- Deploy del Worker: `.github/workflows/cloudflare-edge-security-headers.yml`, en push a `main` que toque `infra/cloudflare/edge-security-headers/**` o `tools/security-header-policy.mjs` (o dispatch con `DEPLOY_EDGE`).
  El deploy de Pages (`static.yml`) y su canary (`post-deploy-canary.yml`, `workflow_run`) corren en paralelo a ese deploy: si el inspector **exigiera** HSTS en el mismo cambio, el canary podría correr antes de que el Worker nuevo esté vivo y fallar. Por eso este plan solo **valida el valor si está presente**; exigirlo queda como paso posterior (Deferred).
- Tests: `test/security-header-policy.test.js` (patrón `test(...)` + `await loadModule()`; casos "accepts the documented edge baseline" línea 24, "rejects drifted CSP and frame policy values" línea 34) y `test/cloudflare-edge-security-worker.test.js`.
- Docs: `docs/operations/EDGE_SECURITY_HEADERS.md` (contrato del edge), `docs/adr/0004-github-pages-cloudflare.md`.

## Commands you will need

| Purpose        | Command                                                                                                                                                              | Provenance | Expected on success              |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | -------------------------------- |
| Install        | `HUSKY=0 npm ci`                                                                                                                                                     | declared   | exit 0                           |
| Tests foco     | `npx vitest run test/security-header-policy.test.js test/cloudflare-edge-security-worker.test.js test/post-deploy-canary.test.js test/live-contract-monitor.test.js` | declared   | verde (omite los que no existan) |
| Suite raíz     | `CI_SKIP_BUILD_CONTRACT=1 npx vitest run`                                                                                                                            | declared   | verde                            |
| Lint           | `npm run lint`                                                                                                                                                       | declared   | exit 0                           |
| Lint md        | `npm run lint:md`                                                                                                                                                    | declared   | 0                                |
| Live (lectura) | `curl -sI https://www.elrincondeebano.com/ \| grep -i strict-transport`                                                                                              | executed   | vacío hoy                        |

## Scope

**In scope**:

- `tools/security-header-policy.mjs`
- `test/security-header-policy.test.js`, `test/cloudflare-edge-security-worker.test.js`
- `docs/operations/EDGE_SECURITY_HEADERS.md`, `docs/adr/0004-github-pages-cloudflare.md` (una nota de estado)

**Out of scope**:

- `infra/cloudflare/edge-security-headers/worker.mjs` (no necesita cambios: emite lo que dicte la política).
- Hacer HSTS **obligatorio** en `inspectSecurityHeaders` (Deferred, tras confirmar en vivo).
- `includeSubDomains`/`preload`, configuración del panel de Cloudflare, el dominio apex.
- Desplegar el Worker a mano: ocurre al fusionar a `main` (workflow existente).

## Git workflow

- Branch: `advisor/287-edge-hsts`.
- Commit: `feat(edge): send HSTS from the security-headers worker (plan 287)`.

## Steps

### Step 0: Baseline

Confirma el plan 280: `grep -n '"wrangler"' package.json` → match en devDependencies (si no → STOP).
Install, tests foco, suite raíz, lint.

**Verify**: verdes.

### Step 1: Añadir HSTS a la política

En `SECURITY_HEADER_POLICY` añade
`'strict-transport-security': 'max-age=31536000',` con un comentario de 2 líneas:
`// Plan 287 / ADR 0004: 1 year, no includeSubDomains, no preload (owner decision 2026-11).`
`// Lowering it later does not un-pin browsers that already saw it — change deliberately.`

**Verify**: `node -e "import('./tools/security-header-policy.mjs').then(m=>console.log(m.buildSecurityHeadersPolicy()['strict-transport-security']))"` → `max-age=31536000`.

### Step 2: El inspector valida HSTS si está presente

En `inspectSecurityHeaders`: añade `'strict-transport-security': readHeader(headers, 'strict-transport-security')` a `observed`.
Regla (NO lo agregues a `missing` cuando falta):

- si está presente y no matchea `/max-age=(\d+)/i` con valor ≥ `15552000` (180 días) → `invalid.push('strict-transport-security (max-age must be >= 15552000)')`.
- si está ausente → nada (comentario: `// Plan 287: optional until the live edge is confirmed; see EDGE_SECURITY_HEADERS.md`).

Tests en `test/security-header-policy.test.js`:

- el baseline (que ahora incluye HSTS) sigue aceptado;
- headers sin HSTS siguen aceptados (`ok: true`);
- `max-age=60` → `ok: false` con el mensaje de `invalid`;
- `buildSecurityHeadersPolicy()` contiene `strict-transport-security`.
  Y en `test/cloudflare-edge-security-worker.test.js` un caso: una respuesta HTML del host canónico sale con `strict-transport-security: max-age=31536000`; una respuesta no-HTML no lo recibe (comportamiento actual del Worker).

**Verify**: tests foco + suite raíz verdes; lint exit 0.

### Step 3: Documentar

- `docs/operations/EDGE_SECURITY_HEADERS.md`: añade HSTS a la lista del baseline con el valor y las
  decisiones (sin subdominios, sin preload), y la regla operativa: "el inspector lo valida si está presente;
  pasa a obligatorio cuando `curl -sI https://www.elrincondeebano.com/` lo muestre tras el deploy del Worker".
- `docs/adr/0004-github-pages-cloudflare.md`: nota de estado al final: "2026-11 (plan 287): HSTS emitido por el Worker; antes de esta fecha la decisión 3 no se cumplía en producción".

**Verify**: `npm run lint:md` → 0.

## Test plan

- 4 casos nuevos en `security-header-policy.test.js`, 1–2 en `cloudflare-edge-security-worker.test.js`.
- Sin cambios de comportamiento en canary/monitor cuando el header falta (no rompe deploys durante la transición).

## Done criteria

- [ ] `grep -n "strict-transport-security" tools/security-header-policy.mjs` → presente en la política y en el inspector
- [ ] Tests foco, suite raíz, lint, lint:md verdes
- [ ] `git diff --name-only main...HEAD` ⊆ In scope; fila 287 en `plans/README.md`
- [ ] Informe incluye la instrucción post-merge para el dueño: verificar `curl -sI https://www.elrincondeebano.com/ | grep -i strict-transport-security` → `max-age=31536000` tras el deploy del workflow "Deploy Cloudflare Edge Security Headers"

## STOP conditions

- El plan 280 no está fusionado (deploy con `npx wrangler` sin fijar).
- Algún test de canary/monitor exige el conjunto exacto de claves de `observed` y fallaría por la clave nueva de forma que obligue a cambiar sus asserts de comportamiento (reporta).
- El dueño pidió `includeSubDomains` o `preload`: requiere inventario de subdominios — fuera de este plan.

## Maintenance notes

- HSTS no se puede "deshacer" rápido: bajar `max-age` solo afecta a visitas futuras. Antes de cambiar de dominio o de CDN, revisar este valor.
- **Deferred:** hacer HSTS obligatorio en `inspectSecurityHeaders` (canary y monitor estricto) — se reabre en cuanto el `curl` post-deploy lo muestre en producción; es un cambio de 2 líneas + un test.
- **Deferred:** HSTS en el apex (`elrincondeebano.com`) e `includeSubDomains` — requiere inventario de subdominios del dueño.
