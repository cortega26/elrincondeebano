# Plan 263: Typecheck del árbol de tests del admin — 142 errores → 0 y cableado (fila 9)

> **Executor instructions**: Sigue este plan paso a paso. Ejecuta cada
> comando de verificación y confirma el resultado esperado antes de pasar
> al siguiente paso. Si ocurre algo en la sección "STOP conditions",
> detente y reporta — no improvises. Al terminar, actualiza la fila de
> estado de este plan en `plans/README.md` — salvo que un reviewer te haya
> despachado y te haya dicho que mantiene el índice.
>
> **Drift check (run first)**: `git diff --stat cb49c431..HEAD -- admin/content-manager/tsconfig.test.json admin/content-manager/test/ admin/content-manager/package.json admin/content-manager/vite.config.ts .github/workflows/admin.yml docs/operations/DEFERRALS.md`
> El inventario de errores de este plan fue medido en `cb49c431`; si
> `test/` cambió, re-mide (Step 0) antes de tocar nada.

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: MED (muchos archivos; cambios solo de tipos)
- **Depends on**: 227 (deuda registrada), 242/254/261 (tocaron `test/`)
- **Category**: dx / types / debt
- **Planned at**: commit `cb49c431`, 2026-10-19

## Why this matters

El plan 227 intentó cablear el typecheck del árbol de tests, la medición
desocultó **143 errores reales en 36 archivos** y la wiring se retiró a
registro (fila 9). Hoy el mecanismo sigue: `tsc -p tsconfig.test.json`
muestra **122× TS6059** (`rootDir: "src"` del base oculta todo) y con el
override de `rootDir` aparecen los errores reales. Cerrarlos + cablear
`typecheck:test` en el script `typecheck` del admin (y su step en
`admin.yml`) elimina la deuda y evita que vuelva a crecer.

## Current state (medido en `cb49c431`)

- `admin/content-manager/tsconfig.test.json`: extiende `tsconfig.json`
  (que trae `rootDir: "src"`, `declaration: true`, `erasableSyntaxOnly`,
  `verbatimModuleSyntax`); `include` cubre `src/**` + `test/**` +
  `vite-env.d.ts`. **Sin `paths`** → los imports `@web/*`/`@shared/*` de
  los tests no resuelven.
- Estado oculto: `npx tsc --noEmit -p tsconfig.test.json` → **122×
  TS6059** ("not under rootDir") — ruido que tapa el resto.
- Estado real: `npx tsc --noEmit -p tsconfig.test.json --rootDir ../..`
  → **142 errores / 38 archivos**:
  - **61× TS2339** (property does not exist — mocks/fixtures sin tipar)
  - **20× TS2322** (no asignable) · **14× TS2741** · **14× TS2739**
    (props/shape incompletos en tests de componentes)
  - **15× TS2307** (Cannot find module `@web/...` — falta `paths`)
  - **10× TS2345** (arg mismatch) + singletons: TS2769, TS2559, TS2554,
    TS2493, TS2353, TS2352, TS1294 (`erasableSyntaxOnly`), TS1117
    (clave duplicada en objeto).
- Alias de Vite (`vite.config.ts:14-19`) — el mapeo a espejar:
  `@shared → src/shared`, `@domain → src/domain`, `@web → src/web`.
- Wiring actual: `admin/content-manager/package.json` →
  `"typecheck": "tsc -p tsconfig.json --noEmit"`; `admin.yml:50-51` →
  step "Typecheck" con el mismo comando; `ci.yml` llama
  `npm run typecheck` (raíz) → `admin:typecheck` → el script del admin.

## Commands you will need

| Purpose           | Command                                                              | Provenance | Expected on success |
| ----------------- | -------------------------------------------------------------------- | ---------- | ------------------- |
| Install           | `HUSKY=0 npm ci`                                                     | declared   | exit 0              |
| Oculto (hoy)      | `npx tsc --noEmit -p tsconfig.test.json` (cwd admin)                 | declared   | 122× TS6059 (antes) |
| Real (inventario) | `npx tsc --noEmit -p tsconfig.test.json --rootDir ../..`             | declared   | 142 errores (antes) |
| Final             | `npx tsc --noEmit -p tsconfig.test.json`                             | declared   | **0 errores**       |
| Admin typecheck   | `npm run admin:typecheck` (raíz; corre src + tests tras el cableado) | declared   | exit 0              |
| Admin tests       | `npm run admin:test`                                                 | declared   | all pass            |
| Lint admin        | `npm run admin:lint`                                                 | declared   | 0 errors            |

## Scope

**In scope**:

- `admin/content-manager/tsconfig.test.json` (rootDir + baseUrl/paths).
- `admin/content-manager/test/**` (arreglos **solo de tipos**).
- `admin/content-manager/package.json` (`typecheck` + `typecheck:test`).
- `.github/workflows/admin.yml` (step "Typecheck").
- Mínima ampliación de tipos exportados en `src/**` **solo si** es
  inevitable y type-only (documentar cada caso).
- `docs/operations/DEFERRALS.md` (fila 9 → Resolved).

**Out of scope**:

- Cambios de conducta en src o tests (runtime byte-equivalente).
- Tests nuevos; refactors; la deuda e2e (ya resuelta por el 258).

## Git workflow

- Branch: `advisor/263-admin-test-typecheck`
- Commits por wave, todos con `(plan 263)`: p. ej.
  `chore(types): fix test-tree paths/rootDir config (plan 263)`,
  `chore(types): type the test mocks and fixtures (plan 263)`, etc.
- No push, no PR.

## Steps

### Step 0: Baseline y reproducción

Instala; captura AMBOS estados a `/tmp/opencode/263-before.log`
(oculto y real con `--rootDir ../..`). Guarda el desglose por código.
Si el total difiere materialmente de 142 (drift de `test/`), repórtalo y
adapta las waves.

### Step 1: Config

En `tsconfig.test.json`:

- `"rootDir": "../.."` (con `noEmit` es inocuo y contiene admin +
  el import cross-workspace si aparece).
- `"baseUrl": "."` + `"paths"` espejando EXACTAMENTE los alias de
  `vite.config.ts` (`@shared/*`, `@domain/*`, `@web/*` → `src/...`).

**Verify**: re-mide. Los TS6059 y los TS2307 de alias deben desaparecer
(o reducirse a los que no sean de alias — repórtalos). Registra el
desglose nuevo; ese es el inventario de las waves.

### Step 2: Waves por clase

Arregla el resto con commits por grupo (orden sugerido):

- **Wave A** — imports/módulos restantes (TS2307 residuales, TS1294).
- **Wave B** — property missing / mocks (TS2339, el grupo grande):
  tipa mocks/fixtures (`vi.mocked`, genéricos, `satisfies`) sin cambiar
  el comportamiento de los tests.
- **Wave C** — asignabilidad (TS2322/2741/2739/2345 y singletons):
  completa shapes/props en los tests.
- **Wave D** — singletons restantes (TS1117, TS2352, TS2554/2559/2493,
  TS2769).

**Regla dura**: cambios de TIPOS en tests; cero cambios de runtime. Si un
arreglo exige tocar la conducta de `src`, **STOP** y reporta (solo se
permiten ampliaciones type-only de exports, justificadas por commit).

**Verify** tras cada wave: el conteo del log baja por clase;
`npm run admin:test` verde (el runtime no cambia).

### Step 3: Cableado

- `admin/content-manager/package.json`:
  `"typecheck:test": "tsc -p tsconfig.test.json --noEmit"` y
  `"typecheck": "tsc -p tsconfig.json --noEmit && npm run typecheck:test"`.
- `.github/workflows/admin.yml`: el step "Typecheck" pasa a correr ambos
  (espejo del script).

**Verify**: `npm run admin:typecheck` (raíz) exit 0 con las DOS patas;
`npx tsc --noEmit -p tsconfig.test.json` → **0 errores**; YAML del
workflow parsea.

### Step 4: Gates + registro

**Verify**: `npm run admin:typecheck` exit 0; `npm run admin:test` verde;
`npm run admin:lint` 0 errors; `git status` limpio (salvo artefactos
gitignored). Mueve la fila "Admin test-tree typecheck debt" a Resolved
citando el commit final + "plan 263" + los números (142→0).

## Test plan

- La deuda ES el test: 142 → 0, y el cableado la hace permanente
  (script + step CI).
- `admin:test` completo corre en cada wave para garantizar que los
  cambios de tipos no alteraron runtime.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npx tsc --noEmit -p tsconfig.test.json` → **0 errores** (sin flags extra)
- [ ] `npm run admin:typecheck` corre src + tests y exit 0
- [ ] `admin.yml` typechequea ambos; YAML válido
- [ ] `admin:test` verde; `admin:lint` exit 0
- [ ] Fila 9 movida a Resolved con los números
- [ ] Fila de `plans/README.md` actualizada (salvo despacho con override)

## STOP conditions

- Un arreglo exige cambiar conducta de runtime (src o tests) — reportar.
- El inventario post-config supera materialmente el registrado (~145)
  por una clase nueva no listada — reportar el desglose antes de seguir.
- El import cross-workspace (`comms.test.ts` → `astro-poc/...`) sigue
  estructuralmente roto tras `rootDir: "../.."` — reportar.

## Maintenance notes

- Reviewer: confirma 0 errores sin flags, el cableado en el script Y en
  el step CI, y que los diffs de `test/**` son type-only (grep de
  `expect(`/arrays de comportamiento sin cambios netos de runtime).
