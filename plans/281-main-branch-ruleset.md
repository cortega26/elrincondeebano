# Plan 281: Proteger `main` con un ruleset que exija CI verde (y que el auto-merge de Dependabot espere de verdad)

> **Executor instructions**: Sigue este plan paso a paso. Ejecuta cada
> comando de verificación y confirma el resultado esperado antes de pasar
> al siguiente paso. Si ocurre algo en la sección "STOP conditions",
> detente y reporta — no improvises. Al terminar, actualiza la fila de
> estado de este plan en `plans/README.md` — salvo que un reviewer te haya
> despachado y te haya dicho que mantiene el índice.
>
> **Drift check (run first)**: `git diff --stat 6d0a29af..HEAD -- .github/workflows/dependabot-auto-merge.yml .github/workflows/ci.yml test/ci-hardening-workflow.test.js docs/operations/DEPENDENCY_POLICY.md .github/rulesets/`

## Status

- **Priority**: P1
- **Effort**: S (código) + 1 acción del dueño del repo (aplicar el ruleset)
- **Risk**: LOW
- **Depends on**: `plans/280-ci-security-hygiene.md` (DEBE estar fusionado: convierte `images.yml` de push directo a `main` en push a una rama `bot/optimized-images-*`; si este ruleset se aplica antes, `images.yml` queda bloqueado)
- **Category**: security
- **Planned at**: commit `6d0a29af`, 2026-11-12 (Auditoría 13)

## Why this matters

`main` no tiene protección (`gh api repos/cortega26/elrincondeebano/branches/main/protection`
→ 404 "Branch not protected"; `rulesets` → 0). El workflow
`dependabot-auto-merge.yml` ejecuta `gh pr merge --auto --squash` creyendo
que "auto" espera a CI (lo dice el plan 168), pero sin checks requeridos
GitHub fusiona de inmediato: los PRs #530, #533, #537 (undici, dependencia
de runtime) y #538 se fusionaron 18–22 s después de abrirse, antes de que
terminara cualquier check. Además, como esos merges los hace `GITHUB_TOKEN`,
**no** disparan workflows de `push`: los SHAs `ad390be4`, `f6f256f4`,
`c844dcc4` y `b9a71f93` de `main` no tienen ningún run de CI ni de deploy.
La protección de la cadena de suministro hoy es "la costumbre del operador".

## Current state

- `.github/workflows/dependabot-auto-merge.yml` (completo, 39 líneas):
  ```yaml
  on:
    pull_request:
      branches: ['main']
  permissions:
    contents: write
    pull-requests: write
  ...
  jobs:
    auto-merge:
      if: github.actor == 'dependabot[bot]'
      ...
      steps:
        - name: Checkout repository
          uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
          with:
            persist-credentials: false
            fetch-depth: 0
        - name: Fetch Dependabot metadata
          id: meta
          uses: dependabot/fetch-metadata@25dd0e34f4fe68f24cc83900b1fe3fe149efef98 # v3.1.0
          with:
            github-token: ${{ secrets.GITHUB_TOKEN }}
        # Only patch — minor/major stay manual per plan 168 recommendation
        - name: Enable auto-merge for patch PRs
          if: steps.meta.outputs.update-type == 'version-update:semver-patch'
          run: gh pr merge --auto --squash "$PR_URL"
          env:
            PR_URL: ${{ github.event.pull_request.html_url }}
            GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  ```
  El gate usa `github.actor` (quién disparó el run), no el autor del PR. El
  patrón correcto de la casa (procedencia del diff) está documentado en el
  plan 225: `github.event.pull_request.user.login == 'dependabot[bot]'`.
  El checkout no es necesario (fetch-metadata usa la API).
- `.github/workflows/ci.yml:3-8` — corre en **todo** PR a `main` (sin
  filtros de path) y en push a `main`. Su job resumen es
  `verify` con `name: CI Verification Summary` (línea ~289), `if: always()`,
  `needs:` todos los jobs; falla si alguno falló. En los check-runs de `main`
  aparece como `CI Verification Summary`, app `github-actions` (id `15368`).
- Repo: `cortega26/elrincondeebano`, público, `allow_auto_merge: true`,
  `deleteBranchOnMerge: true`. Dueño: usuario `cortega26` (rol admin).
- `test/ci-hardening-workflow.test.js:14-25` pinea el SHA de fetch-metadata
  (no lo cambies). Convención de tests de workflows: aserciones de texto con
  `node:assert/strict` y `test(...)` global (mismo archivo como ejemplar).
- Flujo real de cambios de catálogo: PRs del operador (rama `fix/…`/`catalog/…`)
  que se fusionan tras CI verde — este ruleset no les cambia nada salvo que
  ahora la espera es obligatoria.

## Commands you will need

| Purpose        | Command                                                                                                              | Provenance | Expected on success |
| -------------- | -------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------- |
| Install        | `HUSKY=0 npm ci`                                                                                                     | declared   | exit 0              |
| Workflow tests | `npx vitest run test/ci-hardening-workflow.test.js`                                                                  | declared   | verde               |
| JSON válido    | `node -e "JSON.parse(require('fs').readFileSync('.github/rulesets/main-protection.json','utf8'));console.log('ok')"` | declared   | `ok`                |
| Lint md        | `npm run lint:md`                                                                                                    | declared   | 0 errores           |
| Ver ruleset    | `gh api repos/cortega26/elrincondeebano/rulesets`                                                                    | executed   | `[]` hoy            |
| Protección     | `gh api repos/cortega26/elrincondeebano/branches/main/protection`                                                    | executed   | 404 hoy             |

## Scope

**In scope**:

- `.github/workflows/dependabot-auto-merge.yml`
- `.github/rulesets/main-protection.json` (crear — fuente versionada del ruleset)
- `test/ci-hardening-workflow.test.js`
- `docs/operations/DEPENDENCY_POLICY.md` (sección corta "Protección de main")

**Out of scope**:

- Aplicar el ruleset en GitHub: es una **acción del dueño** (Step 4). El executor no tiene ni debe usar permisos de admin del repo.
- `ci.yml` (no renombres el job `verify` ni su `name:` — el ruleset depende de ese texto exacto).
- `images.yml`, `product-data-guard.yml` (plan 280).
- Tokens de GitHub App para que los merges del bot disparen deploy (ver Deferred).

## Git workflow

- Branch: `advisor/281-main-branch-ruleset`.
- Commits estilo `ci: gate dependabot auto-merge on the PR author (plan 281)`.
- No push ni PR salvo instrucción del operador.

## Steps

### Step 0: Baseline

`HUSKY=0 npm ci`; `npx vitest run test/ci-hardening-workflow.test.js` verde.
Confirma que el plan 280 está fusionado: `grep -n 'refs/heads/bot/optimized-images-' .github/workflows/images.yml`
→ al menos 1 match.

**Verify**: test verde y match presente. Si `images.yml` aún empuja directo a
`main` → STOP (dependencia no cumplida).

### Step 1: Gate por autor del PR y sin checkout

En `dependabot-auto-merge.yml`:

1. Cambia `if: github.actor == 'dependabot[bot]'` por
   `if: github.event.pull_request.user.login == 'dependabot[bot]'`.
2. Elimina el step `Checkout repository` completo.
3. Añade un comentario de 2 líneas sobre el step de merge:
   `# --auto only waits for CI because main's ruleset requires "CI Verification Summary"`
   `# (.github/rulesets/main-protection.json, plan 281). Without it, this merges immediately.`

Añade a `test/ci-hardening-workflow.test.js`:

- `dependabot auto-merge gates on the PR author, not the trigger actor`: el
  archivo contiene `github.event.pull_request.user.login == 'dependabot[bot]'`
  y NO contiene `github.actor ==`.
- `dependabot auto-merge does not check out repository code`: no contiene `actions/checkout`.

**Verify**: `npx vitest run test/ci-hardening-workflow.test.js` → verde (incluye el test del SHA existente).

### Step 2: Ruleset versionado

Crea `.github/rulesets/main-protection.json` con exactamente este contenido
(formato de la API REST de rulesets de repositorio):

```json
{
  "name": "main-protection",
  "target": "branch",
  "enforcement": "active",
  "conditions": {
    "ref_name": { "include": ["~DEFAULT_BRANCH"], "exclude": [] }
  },
  "bypass_actors": [{ "actor_id": 5, "actor_type": "RepositoryRole", "bypass_mode": "always" }],
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    {
      "type": "required_status_checks",
      "parameters": {
        "strict_required_status_checks_policy": false,
        "do_not_enforce_on_create": false,
        "required_status_checks": [
          { "context": "CI Verification Summary", "integration_id": 15368 }
        ]
      }
    }
  ]
}
```

Notas para el executor (no las pongas en el JSON):

- `actor_id: 5` + `RepositoryRole` = rol **Admin** del repo (el dueño puede
  saltarse el ruleset de forma explícita, p. ej. para fusionar un PR de
  PR urgente antes de que terminen los checks; evita dejarlo bloqueado fuera de su repo).
- `strict: false`: no exige rebase sobre `main` antes de fusionar (los PRs
  de catálogo son pequeños y frecuentes; exigirlo multiplicaría corridas).
- Solo se exige el check resumen: `verify` ya depende de todos los jobs de CI.
  No exijas `product-data-guard` (filtros de path: a veces no reporta y el PR quedaría colgado).

Añade un test `main ruleset requires the CI summary check`: parsea el JSON y
asserta que `rules` contiene `required_status_checks` con context
`'CI Verification Summary'`, y que `ci.yml` contiene la línea
`name: CI Verification Summary` (si alguien renombra el job, el test avisa).

**Verify**: comando "JSON válido" → `ok`; test verde. Sonda negativa: cambia
temporalmente el `name:` en una copia del contenido de `ci.yml` dentro del
test (no el archivo) o el context en el JSON → el test falla; revierte.

### Step 3: Documentar

En `docs/operations/DEPENDENCY_POLICY.md` añade la sección "Protección de
`main`" (5–8 líneas): qué exige el ruleset, dónde vive
(`.github/rulesets/main-protection.json`), el comando para aplicarlo/actualizarlo
(Step 4), que el auto-merge de patches depende de él, y el bypass de admin.

**Verify**: `npm run lint:md` → 0 errores.

### Step 4: (Acción del DUEÑO, no del executor) Aplicar el ruleset

El executor NO ejecuta esto. Déjalo escrito en el informe final para el
dueño (`cortega26`), que lo corre una vez fusionado este plan:

```bash
gh api -X POST repos/cortega26/elrincondeebano/rulesets \
  --input .github/rulesets/main-protection.json
gh api repos/cortega26/elrincondeebano/rules/branches/main   # debe listar required_status_checks
```

Validación post-aplicación (dueño): el próximo PR de Dependabot patch debe
mostrar "Auto-merge enabled" y fusionarse **después** de que
`CI Verification Summary` esté verde (comparar `mergedAt` vs fin de CI con
`gh pr view <n> --json mergedAt,statusCheckRollup`). Para actualizar el
ruleset más adelante: `gh api -X PUT repos/cortega26/elrincondeebano/rulesets/<id> --input ...`.

**Verify (executor)**: el informe final incluye el bloque anterior literal.

## Test plan

- `test/ci-hardening-workflow.test.js`: +3 tests (gate por autor, sin checkout, ruleset ↔ nombre del job). Sonda negativa en Step 2.
- Suite raíz: `CI_SKIP_BUILD_CONTRACT=1 npx vitest run` → verde.

## Done criteria

- [ ] `grep -n "github.actor ==" .github/workflows/dependabot-auto-merge.yml` → sin match
- [ ] `grep -c "actions/checkout" .github/workflows/dependabot-auto-merge.yml` → 0
- [ ] `.github/rulesets/main-protection.json` existe, es JSON válido y exige `CI Verification Summary`
- [ ] `npx vitest run test/ci-hardening-workflow.test.js` → verde; `CI_SKIP_BUILD_CONTRACT=1 npx vitest run` → verde; `npm run lint` y `npm run lint:md` → exit 0
- [ ] `git diff --name-only main...HEAD` ⊆ In scope
- [ ] Informe final contiene el bloque de aplicación del Step 4
- [ ] Fila del plan 281 en `plans/README.md` actualizada (estado: `DONE (pendiente aplicar ruleset)` hasta que el dueño confirme)

## STOP conditions

- El plan 280 no está fusionado (Step 0).
- `ci.yml` ya no tiene un job llamado `CI Verification Summary`, o tiene filtros de path en `pull_request` (un check requerido que no reporta bloquea PRs).
- El test del SHA de fetch-metadata falla tras tu cambio.
- Te pide aplicar el ruleset con credenciales de admin: no lo hagas, es del dueño.

## Maintenance notes

- Si se renombra el job `verify` de `ci.yml`, hay que actualizar el ruleset en GitHub (PUT) y el JSON; el test lo detecta en el repo, pero GitHub no.
- `images.yml` (plan 280) solo empuja una rama `bot/optimized-images-*`; el dueño abre el PR desde el enlace del resumen del run, y como lo abre una persona, CI corre normalmente.
- **Deferred:** que los merges de Dependabot disparen CI/deploy en `main` — requiere un token de GitHub App en `dependabot-auto-merge.yml`. Hoy los bumps se despliegan con el siguiente push humano; con este ruleset al menos ya pasaron CI completo en el PR. Se reabre si un bump debe llegar a producción sin esperar otro cambio.
- **Deferred:** exigir revisión de PR (1 aprobación) — no aplica a un repo de un solo mantenedor.
