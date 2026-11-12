# Plan 280: Higiene de seguridad de CI — auditoría semanal verde, tokens acotados, Dependabot coherente

> **Executor instructions**: Sigue este plan paso a paso. Ejecuta cada
> comando de verificación y confirma el resultado esperado antes de pasar
> al siguiente paso. Si ocurre algo en la sección "STOP conditions",
> detente y reporta — no improvises. Al terminar, actualiza la fila de
> estado de este plan en `plans/README.md` — salvo que un reviewer te haya
> despachado y te haya dicho que mantiene el índice.
>
> **Drift check (run first)**: `git diff --stat 6d0a29af..HEAD -- .github/ test/ci-hardening-workflow.test.js test/images-workflow.contract.test.js package.json package-lock.json docs/operations/DEFERRALS.md docs/operations/DEPENDENCY_POLICY.md`

## Status

- **Priority**: P1
- **Effort**: M (nueve cambios S, todos en YAML de CI + un devDependency)
- **Risk**: LOW
- **Depends on**: none. **Debe aterrizar ANTES del plan 281** (la protección de `main` bloquearía el push directo de `images.yml`, que este plan convierte a push de rama) y **antes del plan 284** (ambos editan `product-data-guard.yml`).
- **Category**: security
- **Planned at**: commit `6d0a29af`, 2026-11-12 (Auditoría 13)

## Why this matters

El workflow semanal **Security Audits** falla todas las semanas desde el
2026-08-17 (13 corridas seguidas) por una pierna de matriz que apunta a un
lockfile borrado; en al menos dos de esas corridas la pierna sana detectó un
advisory de producción real y quedó escondido dentro de un run que "siempre
está rojo". Además, varios workflows dejan un token con permiso de escritura
disponible mientras corre código de dependencias (`npm ci`), despliegan el
Worker de Cloudflare con un `wrangler` sin versión fija (descargado en cada
deploy junto al token de la zona), y la config de Dependabot usa etiquetas
inexistentes, duplica un directorio y no cubre `tools/requirements-*.txt`.
Cada arreglo es pequeño; juntos restauran una señal de seguridad confiable
y reducen la superficie de cadena de suministro.

## Current state

Archivos y su rol (líneas verificadas en `6d0a29af`):

- `.github/workflows/security-audit.yml` — auditoría semanal (cron lunes).
  Líneas 22-29: matriz con dos piernas; la segunda apunta a un lockfile que
  no existe desde el commit `05670b5c` (2026-08-12, lockfile único de workspaces):
  ```yaml
  include:
    - label: root
      working_directory: .
      lockfile: package-lock.json
    - label: astro-poc
      working_directory: astro-poc
      lockfile: astro-poc/package-lock.json
  ```
  Línea ~38: `cache-dependency-path: ${{ matrix.lockfile }}` → setup-node falla
  con "Some specified paths were not resolved". Último run verde: 2026-08-10.
- `.github/workflows/dependency-review.yml:5-10` — `paths:` incluye
  `astro-poc/package-lock.json` (inexistente; inofensivo pero engañoso).
- `.github/workflows/images.yml` — optimiza imágenes al hacer push a `main`
  en `assets/images/originals/**` (último run real: 2026-08-10). Líneas 16-27:
  `permissions: contents: write` a nivel workflow y `actions/checkout` **sin**
  `persist-credentials: false` (en el SHA fijado `3d3c42e5`, el default es
  `true`: el token queda en `.git/config`). Luego corre
  `bash tools/ci/npm-ci-with-retry.sh` (scripts de instalación de terceros) y
  cuatro herramientas de imágenes con ese token disponible. Al final
  (líneas ~55-72) hace `git push origin HEAD:"refs/heads/${GITHUB_REF_NAME}"`
  **directo a `main`**. Lo pinea `test/images-workflow.contract.test.js`.
- `.github/workflows/product-data-guard.yml:96-136` — job
  `auto-commit-synced-files-for-dependabot` (`contents: write`): corre
  `npm ci` + `npm run build` del árbol de dependencias recién subido por
  Dependabot y **después**, en el mismo workspace, escribe el token en la URL
  del remoto con interpolación inline:
  ```yaml
  git remote set-url origin https://x-access-token:${{ secrets.GITHUB_TOKEN }}@github.com/${{ github.repository }}.git
  ```
  y hace `git push` (sin refspec, desde un HEAD detached en `pull_request`,
  por lo que probablemente ni siquiera funciona). No ha corrido desde que
  su gate cambió (plan 225, `c9d18368`); su último commit real es `34fcbed3`
  (2026-10-14). Lo pinea `test/ci-hardening-workflow.test.js:27-45`.
- `.github/workflows/cloudflare-edge-security-headers.yml:43-65` — setup-node
  **sin** `npm ci`, con `cache-dependency-path` que incluye el inexistente
  `astro-poc/package-lock.json` (línea 50), y luego
  `run: npx wrangler deploy --config infra/cloudflare/edge-security-headers/wrangler.toml`
  con `CLOUDFLARE_API_TOKEN` en env. `wrangler` **no** está en ningún
  `package.json` ni en `package-lock.json` (verificado: 0 entradas
  `node_modules/wrangler`). `package.json` raíz también tiene
  `"cloudflare:whoami": "npx wrangler whoami"` y
  `"cloudflare:deploy:edge-security-headers": "npx wrangler deploy --config ..."`.
- `.github/workflows/quality-gates.yml:16-18` — permisos a nivel workflow:
  ```yaml
  permissions:
    contents: read
    security-events: write
  ```
  Solo el job `trivy` (línea ~58) sube SARIF; los jobs `complexity`
  (`pip install`), `markdownlint` (`npm ci`), `shellcheck` y `actionlint`
  reciben `security-events: write` sin necesitarlo. El patrón correcto ya
  existe en `.github/workflows/semgrep.yml:20-24` (permiso por job).
- Comentarios de versión desfasados un major (verificado con
  `git ls-remote --tags`):
  - `quality-gates.yml:32` y `semgrep.yml:35`:
    `actions/setup-python@6d4fd22b20465ccc0f7354476588e8df7c9ca0e0 # v5` → ese SHA es **v7.1.0**.
  - `quality-gates.yml:85` y `semgrep.yml:70`:
    `github/codeql-action/upload-sarif@33d7b85da1a04171e211befe2c739303b9a4c066 # v3` → ese SHA es **v4.39.3** (verifícalo en el Step 7).
- `.github/workflows/post-deploy-canary.yml:55-57` — concurrencia a nivel
  workflow (`${{ github.workflow }}-${{ github.ref }}`); el job `rollback`
  (líneas ~294-332) despliega a Pages pero **no** comparte el grupo `pages`
  que usan `static.yml:25-27` y `rollback.yml:18-20`.
- `.github/dependabot.yml`:
  - Etiquetas `npm` (líneas 10-12, 49-52), `astro-poc` (línea 52) y
    `github-actions` (líneas 83-85) **no existen** en el repo (`gh label list`:
    existen `dependencies`, `javascript`, `github_actions`, `python`, …).
  - El bloque `directory: '/astro-poc'` (líneas ~43-75) apunta a un directorio
    sin lockfile; el bloque raíz ya actualiza `astro-poc/package.json`
    (ej. PR #539) y generó PRs duplicadas (#455/#458).
  - No hay ecosistema `pip`: `tools/requirements-semgrep.txt:1`
    (`semgrep==1.152.0`, PyPI latest 1.185.0) y `tools/requirements-lizard.txt`
    nunca reciben updates de versión.
- `docs/operations/DEFERRALS.md:23` — fila "Dev-tooling audit findings (9
  residuales: braces-chain, katex/markdownlint, smol-toml@1.8)" con evidencia
  del 2026-10-19 que ya no corresponde: hoy `npm audit --package-lock-only`
  sobre `6d0a29af` da 23 hallazgos dev (4 high, 16 moderate, 3 low), con la
  cadena `minimatch` (GHSA-g3hv-75wg-m249, sin fix no-downgrade) nueva. El PR
  de Dependabot #539 (15 minors, CI verde) levanta los 4 high.
- Producción: `npm audit --omit=dev --package-lock-only` en `6d0a29af` = **0**.

Convención de la casa para tests de workflows: tests de texto sobre el YAML
con `node:assert/strict`, globales de vitest (`test(...)`), ver
`test/ci-hardening-workflow.test.js` (ejemplar exacto a imitar).

## Commands you will need

| Purpose         | Command                                                                                                                                                                                                                                                     | Provenance | Expected on success         |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | --------------------------- |
| Install         | `HUSKY=0 npm ci`                                                                                                                                                                                                                                            | declared   | exit 0                      |
| Workflow tests  | `npx vitest run test/ci-hardening-workflow.test.js test/images-workflow.contract.test.js`                                                                                                                                                                   | declared   | verde                       |
| Suite raíz      | `CI_SKIP_BUILD_CONTRACT=1 npx vitest run`                                                                                                                                                                                                                   | declared   | verde                       |
| Lint            | `npm run lint`                                                                                                                                                                                                                                              | declared   | exit 0                      |
| YAML parse      | `node -e "const y=require('yaml');for(const f of require('fs').readdirSync('.github/workflows'))y.parse(require('fs').readFileSync('.github/workflows/'+f,'utf8'));y.parse(require('fs').readFileSync('.github/dependabot.yml','utf8'));console.log('ok')"` | declared   | `ok`                        |
| Audit prod      | `npm audit --omit=dev --package-lock-only --audit-level=high`                                                                                                                                                                                               | executed   | exit 0, 0 vulnerabilities   |
| Audit completo  | `npm audit --package-lock-only --json`                                                                                                                                                                                                                      | executed   | JSON (23 dev en `6d0a29af`) |
| Tag de un SHA   | `git ls-remote --tags https://github.com/<owner>/<repo> \| grep <sha>`                                                                                                                                                                                      | executed   | líneas `refs/tags/vX.Y.Z`   |
| Edad de versión | `npm view wrangler time --json`                                                                                                                                                                                                                             | executed   | JSON de fechas              |

## Scope

**In scope** (los únicos archivos que puedes modificar):

- `.github/workflows/security-audit.yml`
- `.github/workflows/dependency-review.yml`
- `.github/workflows/images.yml`
- `.github/workflows/product-data-guard.yml` (solo borrar el job `auto-commit-synced-files-for-dependabot`)
- `.github/workflows/cloudflare-edge-security-headers.yml`
- `.github/workflows/quality-gates.yml`
- `.github/workflows/semgrep.yml` (solo los dos comentarios de versión)
- `.github/workflows/post-deploy-canary.yml` (solo `concurrency` del job `rollback`)
- `.github/dependabot.yml`
- `package.json` (devDependency `wrangler` + los dos scripts `cloudflare:*`), `package-lock.json` (solo el churn de `wrangler`)
- `test/ci-hardening-workflow.test.js`, `test/images-workflow.contract.test.js`
- `docs/operations/DEFERRALS.md` (solo la fila dev-tooling), `docs/operations/DEPENDENCY_POLICY.md` (una línea sobre pip)

**Out of scope** (NO tocar):

- El job `ensure-build-in-sync` de `product-data-guard.yml` — lo reestructura el plan 284.
- `dependabot-auto-merge.yml` — lo cambia el plan 281 junto con la protección de rama.
- `infra/cloudflare/**` y `tools/security-header-policy.mjs` — el plan 287 (HSTS) los toca.
- Cualquier `overrides` de npm o bump de dependencias ajeno a `wrangler` (el PR #539 de Dependabot ya cubre los minors; no lo dupliques).
- No crees etiquetas en GitHub ni cambies ajustes del repo: usa las que existen.

## Git workflow

- Branch: `advisor/280-ci-security-hygiene`.
- Un commit por step lógico; estilo de la casa (conventional commits en inglés con número de plan), p. ej. `ci: drop the dead astro-poc leg from the security audit (plan 280)`.
- No hagas push ni abras PR salvo que el operador lo pida.

## Steps

### Step 0: Baseline verde

`HUSKY=0 npm ci`, luego los workflow tests, la suite raíz y `npm run lint`
sobre el checkout sin modificar. Ejecuta también el comando "YAML parse".

**Verify**: todo verde y `ok`. Si algo falla en el checkout limpio → STOP.

### Step 1: Security Audits sin la pierna muerta

En `security-audit.yml` elimina la entrada `label: astro-poc` de la matriz
(deja solo `root`; puedes conservar la matriz de una entrada o aplanarla —
elige lo que deje el YAML más simple). El lockfile raíz ya incluye las
dependencias de producción de ambos workspaces. En `dependency-review.yml`
elimina la línea `- 'astro-poc/package-lock.json'` de `paths:` (conserva
`astro-poc/package.json`).

Añade a `test/ci-hardening-workflow.test.js` un test:
`security-audit only references lockfiles that exist` — lee
`security-audit.yml`, extrae todo valor `lockfile:` y `cache-dependency-path:`
literal y asserta `fs.existsSync(path.join(repoRoot, valor))` para cada uno.

**Verify**: `npx vitest run test/ci-hardening-workflow.test.js` → verde;
sonda negativa: reintroduce temporalmente `astro-poc/package-lock.json` en la
matriz → el test nuevo falla; revierte.

### Step 2: `images.yml` sin token persistido y empujando a una rama (no a `main`)

Hecho verificado (2026-11-12): `gh api repos/cortega26/elrincondeebano/actions/permissions/workflow`
→ `{"default_workflow_permissions":"read","can_approve_pull_request_reviews":false}`. Con ese ajuste,
`GITHUB_TOKEN` **no puede crear PRs**: por eso el workflow solo empuja una rama y el dueño abre el PR.
No actives ese ajuste del repo (es más permiso del necesario).

1. En el `actions/checkout`, añade `persist-credentials: false` (conserva `fetch-depth: 0`).
2. Mueve `permissions: contents: write` del nivel workflow al job (no añadas `pull-requests: write`).
3. Reemplaza el paso final de commit/push. Conserva intacta la lógica de
   allowlist (`OUTSIDE=...`), pero en vez de empujar a `main`:
   - crea la rama `bot/optimized-images-${GITHUB_RUN_ID}` desde HEAD,
   - commitea con el mismo mensaje `chore: update optimized images`,
   - empuja con el token pasado SOLO a este step vía `env:`
     (`GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}`), usando un extraheader efímero:
     `AUTH=$(printf '%s:%s' 'x-access-token' "$GH_TOKEN" | base64 -w0)` y
     `git -c "http.https://github.com/.extraheader=AUTHORIZATION: basic ${AUTH}" push origin "HEAD:refs/heads/bot/optimized-images-${GITHUB_RUN_ID}"`,
   - escribe en `$GITHUB_STEP_SUMMARY` el enlace para que el dueño abra el PR:
     `https://github.com/${GITHUB_REPOSITORY}/compare/main...bot/optimized-images-${GITHUB_RUN_ID}?expand=1`
     (un PR abierto por una persona sí dispara CI).
   - Elimina el `git pull --rebase` previo al push (la rama es nueva).
     Ningún `${{ }}` debe quedar dentro de un bloque `run:` salvo `github.*`
     constantes ya presentes; pasa todo por `env:`.
4. Actualiza `test/images-workflow.contract.test.js` para pinear: (a)
   `persist-credentials: false` presente en `images.yml`; (b) ningún
   `git push` hacia `refs/heads/${GITHUB_REF_NAME}` o `main`; (c) presencia de
   `refs/heads/bot/optimized-images-`; (d) ausencia de `secrets.GITHUB_TOKEN` dentro de
   un bloque `run:` (solo en `env:`). Mantén los tests existentes del archivo que sigan siendo
   ciertos; si alguno pinea el push directo a `main`, reescríbelo al nuevo
   contrato (no lo borres sin reemplazo).

**Verify**: `npx vitest run test/images-workflow.contract.test.js` → verde;
`grep -n 'persist-credentials: false' .github/workflows/images.yml` → 1 match;
`grep -n 'refs/heads/bot/optimized-images-' .github/workflows/images.yml` → 1 match;
`grep -n 'HEAD:"refs/heads/${GITHUB_REF_NAME}"' .github/workflows/images.yml` → sin match.

### Step 3: Borrar el job de auto-commit de Dependabot en `product-data-guard.yml`

Elimina el job `auto-commit-synced-files-for-dependabot` completo
(líneas 96-136). Conserva `outputs.dirty_tree` del job restante (es inocuo y
el plan 284 decide su destino). Razón: corre código del árbol de dependencias
recién subido y luego ejecuta git con credenciales en el mismo workspace;
además no ha corrido desde el 2026-10-14 y su push desde HEAD detached no
funcionaría. Un PR de Dependabot con drift de build fallará el guard y se
arregla a mano (comportamiento aceptado).

Reescribe el test `product-data-guard gates the auto-commit ...` de
`test/ci-hardening-workflow.test.js` como
`product-data-guard has no credentialed auto-commit job`: asserta que el
archivo NO contiene `contents: write`, `x-access-token` ni `git push`.

**Verify**: test verde; `grep -c 'x-access-token' .github/workflows/product-data-guard.yml` → 0;
`grep -rn 'secrets.GITHUB_TOKEN }}@' .github/workflows/` → sin match (ningún token interpolado en una URL de remoto).

### Step 4: `wrangler` fijado y local

1. Elige la versión: `npm view wrangler time --json` → toma la versión
   estable (sin `-beta`/`-rc`) **más reciente publicada hace ≥ 14 días**
   respecto de la fecha de ejecución.
2. `HUSKY=0 npm install --save-dev --save-exact wrangler@<esa versión>` en la raíz
   (única excepción a "nunca `npm install`": es el cambio de manifiesto de
   este plan; después corre `npm ci` para confirmar reproducibilidad).
3. `package.json`: cambia los scripts a `"cloudflare:whoami": "wrangler whoami"` y
   `"cloudflare:deploy:edge-security-headers": "wrangler deploy --config infra/cloudflare/edge-security-headers/wrangler.toml"`.
4. `cloudflare-edge-security-headers.yml`: reemplaza el `actions/setup-node`
   directo por `- uses: ./.github/actions/setup-node-and-deps` (composite de la
   casa: setup-node 24 + `npm ci` con retry; ver
   `.github/actions/setup-node-and-deps/action.yml`), y cambia el deploy a
   `run: npm run cloudflare:deploy:edge-security-headers`. Así desaparece la
   línea `astro-poc/package-lock.json` del cache path.

**Verify**: `npx wrangler --version` (ahora local) imprime la versión elegida;
`node -e "const l=require('./package-lock.json');console.log(l.packages['node_modules/wrangler'].version)"` → la misma;
`grep -n 'npx wrangler' package.json .github/workflows/*.yml` → sin match;
`npm ci` desde cero → exit 0; `npm audit --omit=dev --package-lock-only --audit-level=high` → exit 0.

### Step 5: `security-events: write` solo en `trivy`

En `quality-gates.yml`: deja `permissions: contents: read` a nivel workflow y
añade al job `trivy`:

```yaml
permissions:
  contents: read
  security-events: write
```

Imita `semgrep.yml:20-24`.

**Verify**: `grep -n 'security-events' .github/workflows/quality-gates.yml` → una sola ocurrencia, dentro del job `trivy`.

### Step 6: Rollback del canary en el grupo `pages`

En `post-deploy-canary.yml`, añade al job `rollback`:

```yaml
concurrency:
  group: pages
  cancel-in-progress: false
```

(`static.yml` y `rollback.yml` ya usan `group: pages`; revisa cuál
`cancel-in-progress` usan y documenta en un comentario de una línea por qué
el rollback usa `false`: un rollback nunca debe cancelarse a medias.)

**Verify**: YAML parse `ok`; `npx vitest run test/post-deploy-workflow.test.js` → verde.

### Step 7: Comentarios de versión correctos

Para cada SHA (`6d4fd22b…` setup-python, `33d7b85d…` upload-sarif) resuelve
el tag real con `git ls-remote --tags` (repos `actions/setup-python` y
`github/codeql-action`). Usa el tag semver completo más específico que
apunte a ese SHA (p. ej. `# v7.1.0`, `# v4.39.3`). Corrige los 4 comentarios
(`quality-gates.yml` ×2, `semgrep.yml` ×2). No cambies los SHAs.

**Verify**: para cada línea `uses: …@<sha> # vX.Y.Z` de esos dos archivos,
`git ls-remote --tags <repo> | grep <sha>` incluye `refs/tags/vX.Y.Z`.

### Step 8: `dependabot.yml` coherente

1. Etiquetas: reemplaza `npm` → `javascript`, `github-actions` → `github_actions`;
   elimina `astro-poc`. Solo etiquetas que aparezcan en `gh label list`.
2. Elimina el bloque completo `package-ecosystem: 'npm'` con `directory: '/astro-poc'`.
3. Añade un bloque pip:
   ```yaml
   - package-ecosystem: 'pip'
     directory: '/tools'
     schedule:
       interval: 'monthly'
     cooldown:
       default-days: 7
     open-pull-requests-limit: 2
     labels:
       - 'dependencies'
       - 'python'
     commit-message:
       prefix: 'chore(ci-deps)'
     ignore:
       # Plan 238: lizard pinned deliberately (complexity baseline).
       - dependency-name: 'lizard'
   ```
   Antes de pinear `lizard` como ignorado, abre `tools/requirements-lizard.txt`
   y confirma que también contiene `setuptools<84` (u otra restricción): no
   la toques.
4. En `docs/operations/DEPENDENCY_POLICY.md` añade una línea: "Las
   herramientas Python de CI (`tools/requirements-*.txt`) reciben updates
   mensuales de Dependabot (pip); `lizard` queda fijado a mano."

**Verify**: YAML parse `ok`; `grep -n "astro-poc'" .github/dependabot.yml` → sin match;
`grep -c "package-ecosystem: 'pip'" .github/dependabot.yml` → 1.

### Step 9: Fila DEFERRALS dev-tooling al día

Ejecuta `npm audit --package-lock-only --json` en tu rama (no en el árbol
del operador). Reescribe la fila "Dev-tooling audit findings" de
`docs/operations/DEFERRALS.md:23` con: la fecha de hoy, el conteo real por
severidad, y la composición por cadena (padres que fijan la versión
vulnerable). Si el PR #539 ya está fusionado en tu base, el conteo esperado
ronda 18 (0 high); si no, 23 (4 high) y la reapertura es "fusionar #539".
Mantén el estado `OPEN — accepted (dev-only)` solo para cadenas cuyo padre
publicado más reciente aún fije la versión vulnerable (verifícalo con
`npm view <padre> dependencies`). No inventes números: copia los del JSON.

**Verify**: `npm run lint:md` → 0 errores; la fila cita la fecha de hoy.

## Test plan

- `test/ci-hardening-workflow.test.js`: +1 test (lockfiles de security-audit existen) y 1 test reescrito (product-data-guard sin job con credenciales). Sondas negativas en Steps 1 y 3.
- `test/images-workflow.contract.test.js`: contrato nuevo (persist-credentials false, sin push a main, push a `bot/optimized-images-*`, token solo por `env:`).
- Suite raíz completa: `CI_SKIP_BUILD_CONTRACT=1 npx vitest run` → verde.

## Done criteria

- [ ] `grep -rn 'astro-poc/package-lock.json' .github/` → sin match
- [ ] `grep -c 'x-access-token' .github/workflows/product-data-guard.yml` → 0 y `grep -rn 'secrets.GITHUB_TOKEN }}@' .github/workflows/` → sin match
- [ ] `grep -n 'persist-credentials: false' .github/workflows/images.yml` → 1 match
- [ ] `grep -rn 'npx wrangler' package.json .github/` → sin match; `wrangler` aparece en `devDependencies` con versión exacta
- [ ] `grep -n 'security-events' .github/workflows/quality-gates.yml` → 1 match (job trivy)
- [ ] `grep -rn '# v5$' .github/workflows/quality-gates.yml .github/workflows/semgrep.yml` y `'# v3$'` → sin match en las líneas de setup-python/upload-sarif
- [ ] `npx vitest run test/ci-hardening-workflow.test.js test/images-workflow.contract.test.js test/post-deploy-workflow.test.js` → verde
- [ ] `CI_SKIP_BUILD_CONTRACT=1 npx vitest run` y `npm run lint` → exit 0; `npm run lint:md` → 0
- [ ] `git diff --name-only main...HEAD` ⊆ archivos In scope
- [ ] Fila del plan 280 actualizada en `plans/README.md`

## STOP conditions

- Algún comando del Step 0 falla en el checkout sin modificar.
- `test/images-workflow.contract.test.js` pinea comportamiento que contradice el modo PR de forma que no puedas reemplazarlo por un assert equivalente del nuevo contrato.
- `npm install --save-dev wrangler@X` cambia más de ~150 entradas del lockfile fuera del subárbol de wrangler (churn inesperado): reporta el diff resumido.
- Algún SHA del Step 7 no resuelve a ningún tag semver.
- `gh label list` no contiene `javascript` o `github_actions` (no crees etiquetas: reporta).
- Cualquier cambio requeriría tocar `dependabot-auto-merge.yml`, `infra/cloudflare/**` o el job `ensure-build-in-sync`.

## Maintenance notes

- `images.yml` ahora empuja una rama `bot/optimized-images-<run_id>` y deja en el
  resumen del run el enlace de comparación; el dueño abre el PR (así CI sí
  corre) y lo fusiona cuando `CI Verification Summary` esté verde. El repo
  tiene desactivado "Allow GitHub Actions to create and approve pull
  requests" (verificado 2026-11-12): no lo actives para esto.
- Revisa en el PR que ningún `${{ secrets.* }}` quede interpolado dentro de un `run:`.
- **Deferred:** auto-merge de PRs de imágenes — no vale la pena (el workflow corre ~2 veces al año).
- **Deferred:** override `minimatch@>=11.0.1` para la cadena moderada dev — rechazado (fuerza majors en padres que fijan `^10`); se reabre cuando `@eslint/config-array` / `@typescript-eslint/typescript-estree` adopten minimatch 11 (fila DEFERRALS).
