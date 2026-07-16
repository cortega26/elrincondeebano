# Live Contract Monitor — bypass del challenge de Cloudflare

## Problema

El workflow `Live Contract Monitor` sondea la producción (`https://www.elrincondeebano.com`)
desde un runner alojado por GitHub. Cloudflare evalúa el _managed challenge_ en el edge
**antes** de consultar el origen, así que la IP de datacenter del runner recibe un `403`
con `cf-mitigated: challenge` y la petición termina ahí: nunca llega al origen.

Consecuencia: desde el runner el monitor no puede distinguir un sitio sano de uno caído.
Todas las sondas se clasifican como `observerBlocked`, el estado resulta `inconclusive`
y el workflow abre a diario la incidencia "Live Contract Monitor blocked by Cloudflare".
El job queda en verde, pero **el monitor no aporta cobertura real**.

Verificación del síntoma (desde una IP de datacenter da 403; desde una residencial da 200):

```bash
curl -sS -o /dev/null \
  -w 'http=%{http_code} server=%header{server} cf-mit=%header{cf-mitigated}\n' \
  https://www.elrincondeebano.com/
```

## Solución: header secreto + regla WAF "Skip"

El monitor envía un header secreto en cada sonda. Una regla WAF de Cloudflare que haga
coincidir ese header aplica la acción **Skip**, deja pasar al observador y el monitor
vuelve a ver el origen (200 / 5xx reales). Es independiente de la IP, así que la rotación
de rangos de GitHub Actions no lo afecta.

- Variable de entorno que lee el monitor: `LIVE_MONITOR_BYPASS_TOKEN`
  (ver [tools/live-contract-monitor.mjs](../../tools/live-contract-monitor.mjs)).
- Header que emite: `x-live-monitor-token: <token>`.
- El workflow ya inyecta el secreto:
  [.github/workflows/live-contract-monitor.yml](../../.github/workflows/live-contract-monitor.yml).

Sigue el mismo patrón que el bypass de crawlers sociales
([infra/cloudflare/waf/deploy-crawler-bypass.mjs](../../infra/cloudflare/waf/deploy-crawler-bypass.mjs)),
solo que la coincidencia es por header secreto en lugar de por User-Agent.

## Pasos (una sola vez)

1. **Genera un token largo y aleatorio** (trátalo como una credencial):

   ```bash
   openssl rand -hex 32
   ```

2. **Crea el secreto del repositorio** con ese valor exacto:

   ```bash
   gh secret set LIVE_MONITOR_BYPASS_TOKEN
   ```

3. **Crea la regla WAF "Skip" en Cloudflare** (Dashboard → tu zona → Security → WAF →
   Custom rules → Create rule):
   - Nombre: `Skip challenge for Live Contract Monitor`.
   - Expresión (usa el editor de expresiones, sustituyendo `<TOKEN>` por el valor real):

     ```
     any(http.request.headers["x-live-monitor-token"][*] == "<TOKEN>")
     ```

     En el constructor visual equivale a: Field `HTTP header` → `x-live-monitor-token`,
     Operator `equals`, Value `<TOKEN>`.

   - Acción: **Skip** →
     - marca **All remaining custom rules**, y
     - en "More components to skip" activa **Super Bot Fight Mode** (si es la fuente del challenge).
   - **Coloca la regla en primer lugar**, por encima de la que emite el challenge.

4. **Verifica** que el header abre el paso:

   ```bash
   curl -sS -o /dev/null \
     -H "x-live-monitor-token: <TOKEN>" \
     -w 'http=%{http_code} cf-mit=%header{cf-mitigated}\n' \
     https://www.elrincondeebano.com/
   ```

   Espera `http=200` sin `cf-mit=challenge`. Luego lanza el workflow a mano
   (`Actions → Live Contract Monitor → Run workflow`) o `npm run monitor:live-contract:strict`
   con la variable exportada.

## Qué esperar después

- El estado del monitor pasa de `inconclusive` a `passed`/`failed` real. En cuanto una
  corrida da `passed`, el paso "Close existing monitor issue when healthy" **cierra sola**
  la incidencia abierta (hoy la #376).
- El monitor deja de ser un observador ciego y pasa a **exigir el contrato**: la primera
  corrida real puede revelar hallazgos genuinos de disponibilidad o de headers de seguridad
  (el workflow corre con `--require-security-headers`). Eso es señal legítima, no ruido.

## Remediación cuando el monitor reporta drift (headers / superficie HTML)

Una vez que el observador atraviesa el challenge, el monitor **exige el contrato** de
[tools/security-header-policy.mjs](../../tools/security-header-policy.mjs). Si reporta
`failed` por headers de seguridad o por superficie HTML (no por disponibilidad), casi
siempre es **deriva de despliegue**: el Worker en producción es más antiguo que la
política del repo. No es un bug de código: el repo ya emite el contrato correcto.

Diagnóstico observado (2026-07-15, desde una IP no bloqueada):

- CSP de producción sin el hash `'sha256-…'` en `script-src` y con `'unsafe-inline'` en
  `style-src`. El repo ya emite el hash y `style-src 'self'`; la home no usa estilos
  inline (`<style>` ni `style=`), así que apretar es seguro.
- HTML público con `/cdn-cgi/challenge-platform/` (`__CF$cv$params`) y, de forma variable,
  el bootstrap de insights de Cloudflare.

Causa raíz: el Worker desplegado precede a los commits de endurecimiento (`b11cfc8` añadió
el hash, `4d7aa38` quitó `'unsafe-inline'`). El Worker importa la política en tiempo de
bundle, así que **redeplegarlo** recoge la política vigente.

Pasos:

1. Autentícate y redeplega el Worker (es un despliegue a producción):

   ```bash
   npx wrangler whoami
   npm run cloudflare:deploy:edge-security-headers
   ```

2. Verifica el CSP y la superficie HTML:

   ```bash
   curl -sSI https://www.elrincondeebano.com/ | grep -i content-security-policy
   curl -sS  https://www.elrincondeebano.com/ | grep -o 'cdn-cgi/challenge-platform\|__CF$cv$params\|data-cf-beacon' | sort -u
   ```

   - El CSP debe incluir el hash y `style-src 'self'` → arregla los hallazgos de headers
     (confirmado el 2026-07-15: el redeploy corrige el CSP de inmediato).

3. Corrige la superficie HTML en el **dashboard** (confirmado post-Worker: Cloudflare
   inyecta estos scripts aguas abajo del Worker, con `cf-cache-status: DYNAMIC`, así que el
   redeploy no los quita). No debilites el contrato; ajusta Cloudflare:
   - **Bootstrap inline de insights** → Web Analytics: desactiva la inyección _automática_
     (auto-inject off). El sitio usa **Plausible** (`plausible.io`, en el CSP y en
     `astro-poc/src/layouts/BaseLayout.astro`), no Cloudflare Web Analytics.
   - **Sensor `/cdn-cgi/challenge-platform/` (`__CF$cv$params`)** → Security → Bots →
     **JavaScript Detections: Off** (con Bot Fight Mode ya desactivado para el bypass).

Por qué no se relaja el contrato: la regla de superficie HTML rechaza la inyección automática
de Cloudflare (challenge-platform y bootstrap de insights). El sitio usa Plausible para
analítica, no Cloudflare Web Analytics. Eso es intencional; consulta
[ADR 0008](../adr/0008-enforced-edge-security-contract.md).

### Página offline y `style-src`

`astro-poc/public/pages/offline.html` es autocontenida (CSS crítico inline, sin hoja externa)
para renderizar sin red. Con `style-src 'self'` su estilo inline queda bloqueado, así que su
hash está fijado en `OFFLINE_STYLE_HASH` dentro de
[tools/security-header-policy.mjs](../../tools/security-header-policy.mjs). Si cambias esa
página, actualiza el hash: el guard en `test/security-header-policy.test.js` lo recalcula y
falla si no coincide. Es la única ruta con `<style>` inline; el resto usa CSS externo.

## Notas de seguridad

- Cualquiera que posea el header salta el challenge del edge. Usa un token largo y aleatorio
  y rótalo si se filtra (regenera el secreto y actualiza el `<TOKEN>` de la regla WAF).
- Limita el **Skip** al challenge; no lo uses para saltar reglas de seguridad no relacionadas.
- El _managed challenge_ gratuito (Bot Fight Mode básico) no es saltable por regla; requiere
  Super Bot Fight Mode o que el challenge provenga de una custom rule.
- Documento relacionado: [EDGE_SECURITY_HEADERS.md](./EDGE_SECURITY_HEADERS.md).
