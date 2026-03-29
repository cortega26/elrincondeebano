# Edge Security Headers

## Objetivo

Definir el contrato de hardening que debe aplicar la capa edge delante de GitHub Pages para `https://www.elrincondeebano.com`.

Estado operativo al 2026-03-29:

- El deploy de contenido sigue saliendo desde GitHub Pages.
- Los headers de seguridad no pueden imponerse desde GitHub Pages.
- La corrección real de `RTB-01` depende de Cloudflare u otra capa edge equivalente.
- El baseline repo-side vive en `tools/security-header-policy.mjs` y se despliega con el Worker `elrincondeebano-edge-security-headers`.
- “Repo fixed” significa que el storefront ya no depende de jsDelivr para scripts ejecutables y que el baseline de CSP está versionado en el repo.
- “Production fixed” significa además que el Worker vigente emite ese baseline y que el HTML público llega limpio, sin `rocket-loader.min.js`, sin `/cdn-cgi/challenge-platform/` y sin referencias de scripts a `cdn.jsdelivr.net`.

## Scope

Aplicar este baseline al menos sobre documentos HTML del host canónico:

- `/`
- `/c/**`
- `/p/**`
- `/pages/*.html`
- `/404.html`
- `/offline.html`
- páginas compat root como `/bebidas.html` y `/vinos.html`

Rutas mínimas de verificación operativa:

- `https://www.elrincondeebano.com/`
- `https://www.elrincondeebano.com/pages/bebidas.html`

## Política objetivo

Source of truth repo-side: [tools/security-header-policy.mjs](/home/carlos/VS_Code_Projects/Tienda%20Ebano/tools/security-header-policy.mjs)

Implementación lista para aplicar:

- Worker: [worker.mjs](/home/carlos/VS_Code_Projects/Tienda%20Ebano/infra/cloudflare/edge-security-headers/worker.mjs)
- Template Wrangler: [wrangler.toml.example](/home/carlos/VS_Code_Projects/Tienda%20Ebano/infra/cloudflare/edge-security-headers/wrangler.toml.example)
- Script de deploy: `npm run cloudflare:deploy:edge-security-headers`
- Workflow de deploy: `Deploy Cloudflare Edge Security Headers`

### Response headers

| Header | Valor esperado |
| ---- | ---- |
| `Content-Security-Policy` | `default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; script-src 'self' https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://cloudflareinsights.com https://static.cloudflareinsights.com; manifest-src 'self'; worker-src 'self'; form-action 'self'; upgrade-insecure-requests` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `Permissions-Policy` | `accelerometer=(), autoplay=(), camera=(), display-capture=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=(), browsing-topics=()` |

Notas:

- `style-src` conserva `'unsafe-inline'` por compatibilidad operativa con la superficie actual y Bootstrap.
- Bootstrap CSS/JS ya sale self-hosted desde el build Astro, así que `cdn.jsdelivr.net` deja de formar parte del baseline del storefront.
- `script-src` y `connect-src` permiten los endpoints de Cloudflare Web Analytics para evitar bloqueos cuando esa integración está habilitada en el edge.
- No se debe ampliar `script-src` para acomodar scripts inline dinámicos inyectados por Cloudflare; si aparecen, el remediation path correcto es desactivar esa inyección en edge.
- `frame-ancestors 'none'` y `X-Frame-Options: DENY` se mantienen en conjunto para compatibilidad de navegadores.

## Implementación recomendada en Cloudflare

Usar una Response Header Transform Rule o un Worker en el host `www.elrincondeebano.com`.

Principio:

1. No modificar `astro-poc/dist` para “simular” headers que GitHub Pages no emite.
2. Aplicar la política en edge como contrato de serving.
3. Mantener el host canónico en `www.elrincondeebano.com`.

### Ejemplo operativo

Si se implementa con Worker/edge middleware, la lógica esperada es:

```js
const SECURITY_HEADERS = {
  "Content-Security-Policy": "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; script-src 'self' https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://cloudflareinsights.com https://static.cloudflareinsights.com; manifest-src 'self'; worker-src 'self'; form-action 'self'; upgrade-insecure-requests",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "accelerometer=(), autoplay=(), camera=(), display-capture=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=(), browsing-topics=()"
};

export default {
  async fetch(request, env, ctx) {
    const response = await fetch(request);
    const headers = new Headers(response.headers);

    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      headers.set(name, value);
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }
};
```

La versión lista para repo vive en `infra/cloudflare/edge-security-headers/` y sólo aplica el baseline a respuestas `text/html` del host canónico.

## Deploy operativo

Deploy manual desde un entorno autenticado con Cloudflare:

```bash
npm run cloudflare:whoami
npm run cloudflare:deploy:edge-security-headers
```

Automatización repo-side:

- Push a `main` con cambios en `infra/cloudflare/edge-security-headers/**` o `tools/security-header-policy.mjs` dispara el workflow `Deploy Cloudflare Edge Security Headers`.
- El workflow requiere el secret `CLOUDFLARE_API_TOKEN`.

Hardening adicional esperado en Cloudflare sobre HTML público (`www.elrincondeebano.com/*`):

- `Rocket Loader`: deshabilitado.
- Cualquier challenge o JS-detection que inyecte `/cdn-cgi/challenge-platform/` en respuestas `200` de páginas públicas: deshabilitado o excluido de `/`, `/c/*`, `/p/*`, `/pages/*.html`, `/404.html`, `/offline.html`.
- Cloudflare Web Analytics puede seguir habilitado mientras no introduzca scripts inline no permitidos por el baseline.

## Verificación

Chequeo local/manual:

```bash
curl -sSI https://www.elrincondeebano.com/ | sed -n '/content-security-policy/I;/referrer-policy/I;/x-content-type-options/I;/x-frame-options/I;/permissions-policy/I;p'
curl -sSI https://www.elrincondeebano.com/pages/bebidas.html | sed -n '/content-security-policy/I;/referrer-policy/I;/x-content-type-options/I;/x-frame-options/I;/permissions-policy/I;p'
curl -s https://www.elrincondeebano.com/ | rg -n "cdn\\.jsdelivr\\.net|rocket-loader\\.min\\.js|/cdn-cgi/challenge-platform/"
curl -s https://www.elrincondeebano.com/pages/bebidas.html | rg -n "cdn\\.jsdelivr\\.net|rocket-loader\\.min\\.js|/cdn-cgi/challenge-platform/"
```

Chequeos repo-side ya disponibles:

- `npm run monitor:live-contract:strict`
- workflow `Live Contract Monitor`
- workflow `Post-Deploy Canary` con `require_security_headers=true`
- ambos probes live también fallan si detectan HTML público contaminado por scripts inyectados desde edge

## Cierre de backlog

`RTB-01` se considera cerrado sólo cuando:

1. producción emite el baseline anterior en `/` y `/pages/bebidas.html`
2. `npm run monitor:live-contract:strict` deja de fallar por headers y por HTML surface
3. el canary manual puede correr con `require_security_headers=true` sin fallback ni scripts inyectados desde edge

Estado de cierre al 2026-03-11:

1. cumplido
2. cumplido
3. listo para uso operativo
