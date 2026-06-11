# Plan 003: Hardening de CSP (eliminar unsafe-inline) y agregar patrón Cloudflare a secret-scan

> **Instrucciones para el ejecutor**: Sigue este plan paso a paso. Ejecuta cada
> comando de verificación antes de avanzar. Si algo en "Condiciones de STOP"
> ocurre, detente e informa — no improvises.
> Al terminar, actualiza la fila de este plan en `plans/README.md`.
>
> **Drift check (ejecutar primero)**:
> `git diff --stat 501a0bd..HEAD -- tools/security-header-policy.mjs tools/guardrails/secret-scan.mjs`
> Si alguno cambió, compara los excerpts contra el código vivo antes de proceder.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `501a0bd`, 2026-06-11

## Por qué importa

**Hallazgo 1 — CSP `unsafe-inline` en `style-src`**: La política CSP actual
permite cualquier estilo inline (`'unsafe-inline'`). Esto neutraliza la
protección contra CSS injection: un atacante que consiga inyectar contenido en
la página puede aplicar estilos arbitrarios (exfiltración de datos via CSS
selectors, spoofing de UI, keylogging CSS). Dado que el sitio es estático y
generado por Astro, lo más probable es que no haya inline styles legítimos que
no puedan eliminarse o hashearse.

**Hallazgo 2 — secret-scan sin patrón Cloudflare**: El repositorio usa
Cloudflare activamente (worker en `infra/cloudflare/`, `wrangler.toml`). Si un
token de API de Cloudflare se commitea accidentalmente, el script
`tools/guardrails/secret-scan.mjs` **no lo detectaría**: los 10 patrones
actuales cubren GitHub, npm, AWS, Google, Stripe, Slack, JWT y Bearer — pero
no Cloudflare. Un API token de Cloudflare comprometido permite DNS hijacking,
modificación del WAF y despliegue de workers maliciosos.

## Estado actual

**`tools/security-header-policy.mjs` (líneas 4, 27)**:

```js
const CSP_UNSAFE_INLINE = "'unsafe-inline'";
// ...
['style-src', [CSP_SELF, CSP_UNSAFE_INLINE]],
```

**`tools/guardrails/secret-scan.mjs` (líneas 27–42)** — patrones existentes:

```js
const SECRET_PATTERNS = [
  { id: 'private-key', regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
  { id: 'github-token', regex: /\bgh[pousr]_[A-Za-z0-9]{36,255}\b/g },
  { id: 'npm-token', regex: /\bnpm_[A-Za-z0-9]{36}\b/g },
  { id: 'aws-access-key', regex: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  { id: 'google-api-key', regex: /\bAIza[0-9A-Za-z\-_]{35}\b/g },
  { id: 'stripe-secret', regex: /\bsk_(?:live|test)_[0-9A-Za-z]{16,}\b/g },
  { id: 'slack-token', regex: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
  {
    id: 'generic-secret-assignment',
    regex: /\b(?:api[_-]?key|...)\b\s*[:=]\s*['"][A-Za-z0-9...]{20,}['"]/gi,
  },
  { id: 'jwt-token', regex: /\beyJ[A-Za-z0-9_-]{10,}\.../g },
  { id: 'bearer-token-literal', regex: /\bBearer\s+[A-Za-z0-9._-]{24,}\b/g },
];
// Cloudflare NO está en esta lista
```

## Comandos necesarios

| Propósito                  | Comando                                  | Éxito esperado                |
| -------------------------- | ---------------------------------------- | ----------------------------- |
| Secret scan                | `node tools/guardrails/secret-scan.mjs`  | exit 0, 0 secrets encontrados |
| Tests                      | `npm test`                               | exit 0                        |
| Lint                       | `npm run lint`                           | exit 0                        |
| Build (para verificar CSP) | `npm run build`                          | exit 0                        |
| CSP test                   | `node test/csp.policy.hardening.test.js` | exit 0 (si aplica)            |

## Alcance

**En scope**:

- `tools/security-header-policy.mjs` — eliminar `CSP_UNSAFE_INLINE` de `style-src`
- `tools/guardrails/secret-scan.mjs` — agregar patrón Cloudflare API token

**Fuera de scope** (no tocar):

- `infra/cloudflare/edge-security-headers/` — el worker aplica los headers en
  edge; este plan modifica la política fuente que lo genera
- Cualquier archivo CSS o template — si hay inline styles, este plan los
  documenta como STOP condition, no los elimina
- Otros patrones de secret-scan no mencionados

## Workflow git

- Rama: `fix/security-hardening-003`
- Commits separados por cambio: primero CSP, luego secret-scan
  - `fix(security): remove unsafe-inline from style-src CSP directive`
  - `fix(security): add Cloudflare API token pattern to secret-scan`
- NO hacer push ni abrir PR sin instrucción explícita.

## Pasos

### Paso 1: Verificar que no hay inline styles en el build

Antes de eliminar `unsafe-inline`, confirma que el sitio construido no depende
de estilos inline:

```bash
npm run build && grep -r "style=" astro-poc/dist/ --include="*.html" | grep -v "display:none\|display: none\|visibility" | head -20
```

Si el grep retorna **más de 5 líneas** de inline styles sustanciales (no solo
`display:none` o utility styles), esto es una condición de STOP: la eliminación
de `unsafe-inline` romperá esos estilos. Reporta qué archivos los generan.

Si retorna 0–5 líneas o solo triviales, continúa.

### Paso 2: Eliminar `unsafe-inline` de `style-src`

En `tools/security-header-policy.mjs`, cambia la línea de `style-src`:

**Antes**:

```js
['style-src', [CSP_SELF, CSP_UNSAFE_INLINE]],
```

**Después**:

```js
['style-src', [CSP_SELF]],
```

La constante `CSP_UNSAFE_INLINE` puede quedar definida (se usa en otros
lugares) o eliminarse si solo se usaba aquí — verifica con:

```bash
grep -n "CSP_UNSAFE_INLINE" tools/security-header-policy.mjs
```

Si solo aparece en 2 lugares (definición + el style-src que acabas de cambiar),
puedes eliminar también la definición.

**Verificar**: `grep -n "unsafe-inline" tools/security-header-policy.mjs` → 0 resultados
(o solo en comentarios).

### Paso 3: Ejecutar tests de CSP

```bash
npm test
```

Si existe `test/csp.policy.hardening.test.js`, presta atención a su output. El
test puede necesitar actualización si afirma que `unsafe-inline` está presente.

**Si el test falla** porque asercionaba que `unsafe-inline` existe: actualiza el
test para que aserte que `unsafe-inline` NO está presente en `style-src`.

**Verificar**: `npm test` → exit 0.

### Paso 4: Agregar patrón Cloudflare a `secret-scan.mjs`

En `tools/guardrails/secret-scan.mjs`, agrega **una** entrada al array
`SECRET_PATTERNS` después de la última entrada existente (antes del `]`):

```js
  // Cloudflare API tokens: asignación explícita con token de 40 chars
  { id: 'cloudflare-api-token', regex: /\bcf[_-]?(?:api[_-]?)?token[_-]?[:=]\s*['"]?[A-Za-z0-9_-]{40}['"]?/gi },
```

Este patrón captura asignaciones explícitas como:

```
CF_API_TOKEN=abcd1234...
CLOUDFLARE_API_TOKEN: "abcd1234..."
```

No se agrega un segundo patrón de "valor genérico en contexto cloudflare" porque
un regex amplio sobre 32–40 chars en archivos con las palabras "cloudflare" o
"wrangler" genera falsos positivos frecuentes (hashes de build, IDs de zona,
etc.) y requeriría ajuste continuo.

**Verificar que el scan sigue pasando**:

```bash
node tools/guardrails/secret-scan.mjs
```

Debe terminar con exit 0 y sin findings. Si hay un falso positivo, ajusta el
patrón antes de continuar.

### Paso 5: Ejecutar suite completa

```bash
npm test && npm run lint
```

**Verificar**: exit 0 en ambos.

## Plan de tests

El test existente `test/csp.policy.hardening.test.js` debe actualizarse en el
Paso 3 si hace aserciones sobre `unsafe-inline`. Sigue la estructura del archivo
existente para cualquier aserto nuevo.

Para el secret-scan, no se requiere un test nuevo (el script mismo es el test);
pero si existe `test/` con tests para el guardrail de secret-scan, agrégales un
caso que confirme que el patrón `cloudflare-api-token` existe en `SECRET_PATTERNS`.

## Criterios de done

- [ ] `grep "unsafe-inline" tools/security-header-policy.mjs` → 0 resultados en directivas activas
- [ ] `grep "cloudflare" tools/guardrails/secret-scan.mjs` → al menos 1 resultado en `SECRET_PATTERNS`
- [ ] `node tools/guardrails/secret-scan.mjs` → exit 0, 0 secrets
- [ ] `npm test` → exit 0
- [ ] `npm run lint` → exit 0
- [ ] `plans/README.md` fila actualizada a DONE

## Condiciones de STOP

Detente e informa si:

- El build genera inline styles sustanciales (ver Paso 1) que harían que el
  sitio se vea roto sin `unsafe-inline`.
- El script `secret-scan.mjs` retorna falsos positivos con el nuevo patrón de
  Cloudflare y no puedes ajustar el regex sin conocer el formato exacto del
  token (consulta la documentación de Cloudflare API tokens antes de ajustar).
- `npm test` falla en un test no relacionado a esta área.

## Notas de mantenimiento

- Si en el futuro Astro genera inline styles (por ejemplo, al usar la directiva
  `style:global` o `<style>` en componentes), hay que hashearlos en la CSP en
  lugar de re-habilitar `unsafe-inline`. Documentar en el commit.
- El patrón Cloudflare puede requerir ajuste si el formato de token cambia.
  Revisar con cada actualización de Wrangler.
