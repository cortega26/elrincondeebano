# Plan 293: Tests que pueden fallar — sin aserciones vacías, guardrails con control positivo y un mensaje de WhatsApp "golden"

> **Executor instructions**: Sigue este plan paso a paso. Ejecuta cada
> comando de verificación y confirma el resultado esperado antes de pasar
> al siguiente paso. Si ocurre algo en la sección "STOP conditions",
> detente y reporta — no improvises. Al terminar, actualiza la fila de
> estado de este plan en `plans/README.md` — salvo que un reviewer te haya
> despachado y te haya dicho que mantiene el índice.
>
> **Drift check (run first)**: `git diff --stat 6d0a29af..HEAD -- admin/content-manager/test/contract/jobRunner.test.ts admin/content-manager/test/contract/jobRunnerAdvanced.test.ts admin/content-manager/test/integration/publicationE2E.test.ts admin/content-manager/test/integration/categoryMutationApi.test.ts test/storefront.personalization.spec.js tools/guardrails/secret-scan.mjs tools/guardrails/_utils.mjs test/order-submit.spec.js`
> (El plan 291 modifica `publicationE2E.test.ts` y `publication.test.ts`: es esperado; aplica este plan sobre su versión.)

## Status

- **Priority**: P3
- **Effort**: S–M
- **Risk**: LOW (solo tests + un refactor de exportación sin cambio de conducta)
- **Depends on**: `plans/291-admin-publication-robustness.md` (reescribe los tests de cancelación y cambia la semántica que algunos de estos tests describen), `plans/282-cart-price-index.md` (cambia la firma de `buildWhatsAppMessageText` con un parámetro opcional)
- **Category**: tests
- **Planned at**: commit `6d0a29af`, 2026-11-12 (Auditoría 13)

## Why this matters

Varios tests parecen cubrir rutas críticas pero no pueden fallar:
`getPendingCount() >= 0` (siempre verdadero), `ids.length >= 0`, aserciones
envueltas en `if (res.statusCode === 200)` que pasan sin asertar nada si el
status es otro, "commit-only completes" que pasa si el job **falla**, y
"recovery state is cleared" que solo comprueba tipos. Un guardrail de
secretos con 11 regex no tiene ningún test: un typo que lo haga no detectar
nada pasaría inadvertido (un guard roto y uno sano se ven igual: verdes). El
guard de bump de caché del SW compara contra `origin/main`, que en un push a
`main` es el propio HEAD: el diff es vacío y el guard no corre. Y no hay un
test que fije el mensaje de WhatsApp completo con literales (los existentes
derivan lo esperado con el mismo `toLocaleString` que el código).

## Current state

- `admin/content-manager/test/contract/jobRunner.test.ts:~200-215`:
  `expect(runner.getPendingCount()).toBeGreaterThanOrEqual(0);` (dos veces, una dentro de `vi.waitFor`).
- `admin/content-manager/test/contract/jobRunnerAdvanced.test.ts:~51-80` — test `schedule rejects second overlapping publication`:
  nombre engañoso (el runner **encola**, no rechaza); `expect(runner.getPendingCount()).toBeGreaterThanOrEqual(0); // may already be processed`.
- `admin/content-manager/test/integration/publicationE2E.test.ts`:
  - `~120-135`: bucle que acepta `completed` **o** `failed` como terminal y solo asserta `commit` si completó.
  - `~170-173`: `expect(typeof recov.pending_recovery).toBe('boolean'); expect(recov.state === null || typeof recov.state === 'object').toBe(true);`
  - `~194-204`: `if (res.statusCode === 200) { … expect(['cancelled','completed','failed']).toContain(job.status); }` (el plan 291 lo reescribe; verifica).
- `test/storefront.personalization.spec.js:~144`: `expect(ids.length).toBeGreaterThanOrEqual(0);`
- `admin/content-manager/test/integration/categoryMutationApi.test.ts:~495`: `await new Promise((r) => setTimeout(r, 1500));` antes de leer `data/media-intents/` (sleep real fijo).
- `tools/guardrails/secret-scan.mjs`: `SECRET_PATTERNS` (líneas 28-46, 11 patrones con `id`), `scanFile(filePath)` (~95-110), y `main()` se invoca **al importar** (línea 131: `main();`). Sin tests (`git grep -l "secret-scan" test admin/content-manager/test` → vacío).
- `tools/guardrails/_utils.mjs:~25-36`:
  ```js
  export function getBaseRef() {
    try {
      sh('git rev-parse --verify origin/main');
      return 'origin/main';
    } catch {
      return 'HEAD~1';
    }
  }
  export function getDiffRange() {
    const base = getBaseRef();
    return `${base}...HEAD`;
  }
  ```
  `tools/guardrails/sw-cache-bump.mjs:12-17` sale con `ok(...)` si `service-worker.js` no está en `changedFiles()`.
- `test/order-submit.spec.js` — patrón `makeController()` + `controller.buildWhatsAppMessageText(cart, total, pago, stock, nota)`; los esperados se calculan con `toLocaleString('es-CL')`.
- Formato real del mensaje (`astro-poc/src/scripts/storefront/order-submit.js:22-53`): encabezado `🛒 *Nuevo Pedido - El Rincón de Ébano*`, línea vacía, por ítem `*<nombre>*` / `   <q> × $<p> = $<s>` / vacía, separador `_ _ _ _ _ _ _ _ _ _ _ _ _ _ _`, vacía, `*Total:* $<t>`, `*Pago:* <pago>`, `*Stock:* <pref>`, y opcional `📝 *Nota:* <nota>`; unido con `\n`.

## Commands you will need

| Purpose     | Command                                                                                                                                                           | Provenance | Expected on success |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------- |
| Install     | `HUSKY=0 npm ci`                                                                                                                                                  | declared   | exit 0              |
| Admin suite | `npm run admin:test`                                                                                                                                              | declared   | verde               |
| Suite raíz  | `CI_SKIP_BUILD_CONTRACT=1 npx vitest run`                                                                                                                         | declared   | verde               |
| Guardrails  | `npm run guardrails`                                                                                                                                              | declared   | exit 0              |
| Secret scan | `npm run security:secret-scan`                                                                                                                                    | declared   | exit 0              |
| Repetición  | `for i in $(seq 1 10); do npm -w admin/content-manager exec vitest run test/contract/jobRunner.test.ts test/contract/jobRunnerAdvanced.test.ts \|\| exit 1; done` | declared   | 10/10               |

## Scope

**In scope**:

- Los 5 archivos de test citados (admin) y `test/storefront.personalization.spec.js`
- `tools/guardrails/secret-scan.mjs` (exportar + guardar `main()`), `tools/guardrails/_utils.mjs` (`getBaseRef`)
- `test/guardrails.secret-scan.test.js` (crear), `test/guardrails.utils.test.js` (crear), `test/order-submit.spec.js`

**Out of scope**:

- Cambiar conducta de producción del JobRunner, la publicación o el storefront.
- Los demás guardrails (`sw-forbidden`, `image-size-check`, `dependency-manifest-compat`) — ver Deferred.
- Mutation testing / Stryker.

## Git workflow

- Branch: `advisor/293-test-quality`.
- Commits por bloque: `test(admin): assert exact job-runner states (plan 293)`, `test(guardrails): positive controls for the secret scan (plan 293)`, `test(storefront): golden WhatsApp message (plan 293)`.

## Steps

### Step 0: Baseline

Confirma 291 y 282 fusionados (`grep -n "PUBLICATION_IN_PROGRESS" admin/content-manager/src/server/routes/publication.ts`; `grep -n "unavailableIds" astro-poc/src/scripts/storefront/order-submit.js`). Install; suites; guardrails.

### Step 1: Aserciones exactas en el admin

- `jobRunner.test.ts`: con el primer job bloqueado (el test ya tiene un `release`), asserta `getPendingCount() === 2` tras programar los dos siguientes (espera con `vi.waitFor` a que el primero esté `running`).
- `jobRunnerAdvanced.test.ts`: renombra a `schedule queues a second publication until the first finishes`; asserta
  `secondStarted === false` mientras `running === true`, y `getPendingCount() === 1` en ese momento; tras terminar, `secondStarted === true`.
- `publicationE2E.test.ts`:
  - "commit-only completes": asserta `status === 'completed'` y `result.commit` con forma de SHA (`/^[0-9a-f]{7,40}$/`). Si en el repo temporal falla de forma legítima (p. ej. no hay cambios que commitear), prepara un cambio en `data/` antes de lanzar — STOP si no logras un `completed` determinista.
  - "recovery state is cleared": tras `completed`, asserta `pending_recovery === false` y `state === null`.
  - Cualquier `if (res.statusCode === 200)` restante: reemplázalo por `expect(res.statusCode).toBe(200)` seguido de las aserciones.
- `categoryMutationApi.test.ts:~495`: reemplaza el sleep por
  `await vi.waitFor(() => expect(readdirSync(intentsDir).filter((f) => f.endsWith('.json')).length).toBeGreaterThan(0), { timeout: 5000, interval: 50 });`
  (crea `intentsDir` con `existsSync` en el callback si puede no existir aún).

**Verify**: admin suite verde; comando "Repetición" 10/10.

### Step 2: Personalización

`storefront.personalization.spec.js:~144`: reemplaza `>= 0` por el valor exacto que produce el escenario (lee el test: con señales vacías/ inválidas, el resultado esperado es determinista — calcula y fija la lista o su longitud exacta).

**Verify**: suite raíz verde.

### Step 3: Control positivo del secret scan

1. En `secret-scan.mjs`: exporta `SECRET_PATTERNS` y una función pura `scanContent(content, filePath = '<memory>')` que contenga el bucle de matching que hoy vive en `scanFile` (que pasa a leer el archivo y delegar). Reemplaza la línea final `main();` por
   `if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) { main(); }`
   (importa `fileURLToPath` de `node:url` y `path` si faltan). La salida y el exit code al ejecutarlo como script no cambian.
2. Crea `test/guardrails.secret-scan.test.js`: para **cada** `id` de `SECRET_PATTERNS`, construye una muestra **en tiempo de ejecución por concatenación** (nunca un literal completo en el archivo: p. ej. `'gh' + 'p_' + 'A'.repeat(36)`, `'-----BEGIN ' + 'RSA PRIVATE KEY-----'`) y asserta que `scanContent` reporta ese `id`. Añade un texto limpio → 0 hallazgos. Asserta además que el número de ids cubiertos === `SECRET_PATTERNS.length` (si alguien añade un patrón sin muestra, el test falla).

**Verify**: test nuevo verde; `npm run security:secret-scan` → exit 0 (el archivo de test no dispara el scan: compruébalo; si lo dispara, ajusta la construcción de las muestras, no excluyas el archivo).

### Step 4: Base del diff en push a main

En `_utils.mjs`, `getBaseRef()`: si `origin/main` existe **y** `git rev-parse HEAD` === `git rev-parse origin/main`, devuelve `'HEAD~1'` (en un push a `main`, comparar contra el commit anterior). Mantén el resto igual.
Crea `test/guardrails.utils.test.js` probando `getBaseRef` con un `sh` inyectable: si hoy `sh` no es inyectable, extrae una función pura `chooseBaseRef({ hasOriginMain, headSha, originMainSha })` usada por `getBaseRef`, y prueba sus 3 casos.

**Verify**: `npm run guardrails` exit 0; test nuevo verde.

### Step 5: Mensaje de WhatsApp "golden"

En `test/order-submit.spec.js` añade `it('builds the full WhatsApp message (golden, literal strings)')`:
carrito `[{ name: 'Aceite Maravilla 900 mL', price: 3600, discount: 0, quantity: 2 }, { name: 'Leche', price: 1200, discount: 300, quantity: 1 }]`,
total `8100`, pago `'Efectivo'`, stock `'Sustituir por similar'`, nota `'Depto 302'`; asserta `toBe` contra la cadena completa escrita **a mano con literales**
(`'2 × $3.600 = $7.200'`, `'1 × $900 = $900'`, `'*Total:* $8.100'`, etc., unidas con `\n` según el formato de "Current state").
Si el plan 282 añadió la anotación de sin stock, añade una segunda variante con `unavailableIds` que incluya la línea `   ⚠️ Sin stock en el catálogo` en su lugar exacto.

**Verify**: suite raíz verde.

## Test plan

- Admin: 4 tests endurecidos + 1 sin sleep; 10/10 repeticiones.
- Raíz: 1 personalización exacta, secret-scan (11 + 1 casos), base ref (3 casos), golden WhatsApp (1–2).

## Done criteria

- [ ] `grep -rn "toBeGreaterThanOrEqual(0)" admin/content-manager/test test/storefront.personalization.spec.js` → sin match
- [ ] `grep -n "if (res.statusCode === 200)" admin/content-manager/test/integration/publicationE2E.test.ts` → sin match
- [ ] `grep -n "setTimeout(r, 1500)" admin/content-manager/test/integration/categoryMutationApi.test.ts` → sin match
- [ ] `test/guardrails.secret-scan.test.js` cubre todos los ids; `npm run security:secret-scan` exit 0
- [ ] Suites, guardrails verdes; repetición 10/10
- [ ] `git diff --name-only main...HEAD` ⊆ In scope; fila 293 en `plans/README.md`

## STOP conditions

- 291 o 282 no fusionados.
- Endurecer un test revela un comportamiento no determinista real (p. ej. "commit-only" a veces falla): repórtalo con la salida — es un hallazgo, no lo escondas.
- El test de secret-scan solo pasa excluyéndose a sí mismo del escaneo.

## Maintenance notes

- Regla: un guard nuevo llega con su control positivo (una entrada que debe detectar) en el mismo PR.
- **Deferred:** controles positivos para `sw-forbidden`, `image-size-check` y `dependency-manifest-compat` — este último falla ruidosamente ante errores; los otros dos se reabren si cambian sus patrones.
