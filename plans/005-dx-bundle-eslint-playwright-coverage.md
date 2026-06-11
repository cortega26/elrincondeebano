# Plan 005: Bundle DX — ESLint TypeScript + Playwright retries + coverage thresholds

> **Instrucciones para el ejecutor**: Sigue este plan paso a paso. Cada paso
> es independiente y verificable. Si algo en "Condiciones de STOP" ocurre,
> detente e informa — no improvises.
> Al terminar, actualiza la fila de este plan en `plans/README.md`.
>
> **Drift check (ejecutar primero)**:
> `git diff --stat 501a0bd..HEAD -- eslint.config.cjs playwright.astro.config.ts vitest.config.mts`
> Si alguno cambió, compara los excerpts contra el código vivo.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `501a0bd`, 2026-06-11

## Por qué importa

Tres gaps de tooling independientes, cada uno de S esfuerzo, agrupados por
economía:

1. **Root ESLint excluye TypeScript**: `eslint.config.cjs` tiene el glob
   `'**/*.{js,mjs,cjs}'` — los archivos `.ts` y `.mts` de la raíz
   (`playwright.astro.config.ts`, `playwright.config.ts`, `vitest.config.mts`,
   `cypress.config.ts`) no son lintados por `npm run lint`. Errores de config
   pasan sin detección.

2. **Playwright sin `retries`**: `playwright.astro.config.ts` no configura
   `retries`. Fallos transientes en E2E (timing, red) requieren re-run manual
   del workflow entero — una fuente frecuente de fricción en CI.

3. **Sin coverage thresholds**: `vitest.config.mts` reporta cobertura pero no
   la impone. Un PR que borra tests o agrega código sin tests pasa CI sin alarma.

## Estado actual

**`eslint.config.cjs` (líneas 29)**:

```js
files: ['**/*.{js,mjs,cjs}'],   // ← .ts y .mts no están incluidos
```

**`playwright.astro.config.ts` (completo)**:

```ts
export default defineConfig({
  testDir: 'test/e2e-astro',
  fullyParallel: false,
  timeout: 60_000,
  // Sin campo "retries"
  use: { baseURL },
  projects: [{ name: 'chromium-desktop', ... }],
  webServer: { ... },
});
```

**`vitest.config.mts` (líneas 14–17)**:

```ts
coverage: {
  provider: 'v8',
  reporter: ['text', 'json', 'html'],
  // Sin campo "thresholds"
},
```

## Comandos necesarios

| Propósito | Comando                                                    | Éxito esperado             |
| --------- | ---------------------------------------------------------- | -------------------------- |
| Lint      | `npm run lint`                                             | exit 0                     |
| Tests     | `npm test`                                                 | exit 0                     |
| Coverage  | `npx vitest run --coverage`                                | exit 0                     |
| E2E check | `npx playwright test -c playwright.astro.config.ts --list` | muestra tests, sin errores |
| Typecheck | `npm run typecheck`                                        | exit 0                     |

## Alcance

**En scope**:

- `eslint.config.cjs` — agregar soporte TypeScript al glob
- `playwright.astro.config.ts` — agregar `retries: 1`
- `vitest.config.mts` — agregar `thresholds` en `coverage`

**Fuera de scope** (no tocar):

- `astro-poc/eslint.config.*` — ESLint de astro-poc es independiente
- `astro-poc/` — no modificar
- Los tests mismos — los thresholds iniciales serán conservadores para no
  romper CI inmediatamente

## Workflow git

- Rama: `chore/dx-bundle-005`
- Commit único: `chore(dx): add TS linting, playwright retries, coverage thresholds`
- NO hacer push ni abrir PR sin instrucción explícita.

## Pasos

### Paso 1: Agregar TypeScript al glob de ESLint

En `eslint.config.cjs`, cambia el glob de files de la regla principal:

**Antes** (línea 29):

```js
files: ['**/*.{js,mjs,cjs}'],
```

**Después**:

```js
files: ['**/*.{js,mjs,cjs,ts,mts}'],
```

> **Nota**: La dependencia `typescript-eslint@8.59.3` ya está instalada en
> `devDependencies`. No es necesario instalar nada nuevo. Sin embargo, si el
> linter reporta errores de parsing en archivos `.ts` (porque el plugin de TS
> no está activado), puede ser necesario agregar también el parser. En ese caso,
> agrega en el mismo objeto:
>
> ```js
> languageOptions: {
>   ...   // opciones existentes
>   parser: require('@typescript-eslint/parser'),
> },
> ```
>
> Verifica si es necesario ejecutando el Paso 1 de verificación primero.

**Verificar**: `npm run lint` → exit 0. Si hay errores de parsing en `.ts`,
sigue la nota de arriba. Si hay errores de estilo legítimos en los archivos
TypeScript de la raíz, corrígelos en este mismo commit (son archivos de config,
los errores serán triviales).

### Paso 2: Agregar retries a Playwright

En `playwright.astro.config.ts`, agrega `retries: 1` después de `timeout`:

**Antes**:

```ts
export default defineConfig({
  testDir: 'test/e2e-astro',
  fullyParallel: false,
  timeout: 60_000,
  use: {
```

**Después**:

```ts
export default defineConfig({
  testDir: 'test/e2e-astro',
  fullyParallel: false,
  timeout: 60_000,
  retries: 1,
  use: {
```

**Verificar**: `npx playwright test -c playwright.astro.config.ts --list` →
lista de tests sin errores de configuración.

### Paso 3: Establecer coverage thresholds en Vitest

Primero, establece la baseline actual:

```bash
npx vitest run --coverage 2>&1 | grep -E "All files|Stmts|Funcs|Branch|Lines" | head -5
```

Anota los porcentajes reportados. Los thresholds deben ser **5 puntos por debajo**
del valor actual para evitar romper CI inmediatamente, pero establecer un piso.

En `vitest.config.mts`, actualiza la sección `coverage`:

```ts
coverage: {
  provider: 'v8',
  reporter: ['text', 'json', 'html'],
  thresholds: {
    statements: <baseline_statements - 5>,
    branches: <baseline_branches - 5>,
    functions: <baseline_functions - 5>,
    lines: <baseline_lines - 5>,
  },
},
```

Reemplaza `<baseline_X - 5>` con los valores reales. Redondea hacia abajo al
entero más cercano. Ejemplo: si `statements` está en 67.3%, usa `62`.

**Verificar**: `npx vitest run --coverage` → exit 0 (los thresholds deben
pasarse con la baseline actual).

### Paso 4: Ejecutar suite completa

```bash
npm test && npm run lint && npm run typecheck
```

**Verificar**: exit 0 en todos.

## Plan de tests

Este plan no requiere tests nuevos — es infraestructura. La verificación es que
los comandos existentes sigan pasando con la nueva configuración.

## Criterios de done

- [ ] `grep "ts,mts" eslint.config.cjs` → al menos 1 resultado
- [ ] `npm run lint` → exit 0 (incluye archivos `.ts` en raíz)
- [ ] `grep "retries" playwright.astro.config.ts` → al menos 1 resultado
- [ ] `grep "thresholds" vitest.config.mts` → al menos 1 resultado
- [ ] `npx vitest run --coverage` → exit 0 (thresholds pasados)
- [ ] `npm test` → exit 0
- [ ] `plans/README.md` fila actualizada a DONE

## Condiciones de STOP

Detente e informa si:

- El linter en `.ts` lanza muchos errores legítimos que tardarían más de 30 min
  en corregir (indicaría que los archivos TypeScript de la raíz tienen deuda de
  lint significativa — mejor hacerlo en un plan separado).
- `npx vitest run --coverage` no puede completarse (coverage config rota) —
  en ese caso aplica solo los cambios de ESLint y Playwright, reporta el
  problema de coverage.
- Los thresholds que calculas con la baseline resultan ser 0% en alguna métrica
  (indicaría que coverage no funciona correctamente).

## Notas de mantenimiento

- Los thresholds deben aumentarse gradualmente con cada sprint una vez que la
  cobertura mejore (ver Plan 007 y Plan 008).
- `retries: 1` significa que cada test fallido se reintenta una vez. Si los E2E
  son estables, se puede bajar a 0; si siguen siendo flaky, subir a 2.
- Cuando se elimine Cypress (Plan 001), el `cypress.config.ts` de la raíz
  desaparece — el glob de TypeScript en ESLint ya no lo procesará
  (comportamiento correcto).
