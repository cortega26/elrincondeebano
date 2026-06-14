# Plan 008: Arreglar tooling de desarrollo — npm run dev, lint-staged TS, .editorconfig, @eslint/js

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.

> **Drift check (run first)**: `git diff --stat 4751633..HEAD -- package.json eslint.config.cjs`
> Si los archivos cambiaron, compara excerpts contra código vivo; si hay mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `4751633`, 2026-06-14

## Why this matters

Cuatro micro-fixes que eliminan fricción diaria:

1. **DX-1/D-1**: `CLAUDE.md` documenta `npm run dev` pero `package.json` no tiene ese script. Cada nuevo desarrollador (o agente) que sigue la documentación obtiene un error en el primer comando. Es el problema clásico de "setup instructions that no longer compile".

2. **DX-2**: `lint-staged` solo corre ESLint en `*.{js,mjs,cjs}`. Los archivos TypeScript (`*.ts`, `*.mts`) solo reciben Prettier, dejando pasar errores de tipo en pre-commit.

3. **DX-6**: No existe `.editorconfig`. Editores sin soporte Prettier no tienen guía de indentación/encoding.

4. **DM-04**: `@eslint/js` está pineado a `^10.0.1` mientras que `eslint` está en `^10.4.1`. Puede haber desalineación de reglas entre el parser y el plugin.

## Current state

### DX-1: Missing dev script

```json
// package.json — NO tiene script "dev"
"scripts": {
  "bootstrap": "npm ci && npm --prefix astro-poc ci",
  // ... ~50 scripts, ninguno llamado "dev"
}

// astro-poc/package.json:13
"dev": "astro dev"
```

CLAUDE.md:10 documenta `npm run dev` pero solo funciona desde `astro-poc/`.

### DX-2: lint-staged skips TS

```json
// package.json:112-123
"lint-staged": {
  "*.{js,mjs,cjs}": ["eslint --max-warnings=0", "prettier --write"],
  "*.{ts,mts}": ["prettier --write"],              // ← sin ESLint
  "*.{json,md,css,html}": ["prettier --write"]
}
```

### DM-04: @eslint/js version gap

```json
// package.json:78-79
"@eslint/js": "^10.0.1",   // ← resuelve a 10.0.1
"eslint": "^10.4.1",       // ← resuelve a 10.4.1
```

## Commands

| Purpose   | Command             | Expected on success |
| --------- | ------------------- | ------------------- |
| Typecheck | `npm run typecheck` | exit 0              |
| Tests     | `npm test`          | all pass            |
| Lint      | `npm run lint`      | exit 0              |
| Bootstrap | `npm run bootstrap` | exit 0              |

## Scope

**In scope**:

- `package.json` (root) — añadir `dev` script, actualizar lint-staged, actualizar `@eslint/js` semver
- Crear `.editorconfig` en raíz

**Out of scope**:

- `astro-poc/package.json` — no se modifica
- `eslint.config.cjs` — no se modifica (solo se alinean versiones)
- `.prettierrc` o config de Prettier

## Git workflow

- Branch: `advisor/008-dx-fixes`
- Commit messages: `dx: add missing dev script, enable ESLint on TS pre-commit, add .editorconfig`
- No push/PR sin indicación.

## Steps

### Step 1: Añadir script `dev` al root

En `package.json`, añadir en `scripts`:

```json
"dev": "npm --prefix astro-poc run dev",
```

**Verify**: `npm run dev` → inicia Astro dev server (Ctrl+C para detener). O verificar que el script existe: `node -e "const p=require('./package.json'); console.assert(p.scripts.dev, 'dev script missing')"` → sin output.

### Step 2: Activar ESLint en TypeScript pre-commit

En `package.json`, cambiar la entrada de lint-staged:

```json
"*.{ts,mts}": ["eslint --max-warnings=0", "prettier --write"],
```

**Verify**: `npx lint-staged --diff="HEAD"` o simular haciendo un cambio en un `.ts` file:

```bash
echo "// test" >> astro-poc/src/lib/formatting.ts
git add astro-poc/src/lib/formatting.ts
npx lint-staged
git checkout -- astro-poc/src/lib/formatting.ts
```

### Step 3: Alinear @eslint/js con eslint

En `package.json`:

```json
"@eslint/js": "^10.4.1",
```

Luego ejecutar `npm update @eslint/js` (o `npm ci` si se prefiere lockfile).

**Verify**: `npm ls @eslint/js` → muestra `10.4.1` (o superior compatible con `^10.4.1`)

### Step 4: Crear .editorconfig

Crear `.editorconfig` en la raíz:

```ini
root = true

[*]
indent_style = space
indent_size = 2
end_of_line = lf
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = true

[*.md]
trim_trailing_whitespace = false

[Makefile]
indent_style = tab
```

**Verify**: `cat .editorconfig` → existe y tiene contenido correcto

### Step 5: Validación completa

```bash
npm run typecheck && npm run lint && npm test
```

**Verify**: Todo exit 0.

## Test plan

No se requieren tests nuevos (cambios de configuración solamente). Verificar que `npm test` sigue pasando sin cambios.

## Done criteria

- [ ] `npm run dev` funciona desde la raíz del proyecto
- [ ] `package.json` tiene `"dev": "npm --prefix astro-poc run dev"`
- [ ] `lint-staged` corre ESLint en `*.{ts,mts}`
- [ ] `.editorconfig` existe con las settings que coinciden con Prettier
- [ ] `@eslint/js` versión alineada con `eslint` (mismo minor)
- [ ] `npm test` exits 0

## STOP conditions

- Si `npm run dev` falla porque `astro-poc/node_modules` no está instalado (correr `npm run bootstrap` primero es esperado).
- Si activar ESLint en TypeScript files revela errores preexistentes no detectados. Si son pocos (<5), corregirlos. Si son muchos (>10), reportar y revertir el cambio en lint-staged (mantener solo Prettier para TS por ahora).
- Si `@eslint/js@10.4.1` introduce breaking changes vs `10.0.1` que rompen el lint config.

## Maintenance notes

- Si se migra a npm workspaces en el futuro, el script `dev` puede simplificarse a `npm -w astro-poc run dev`.
- El `.editorconfig` debe mantenerse sincronizado con `.prettierrc` (o viceversa). Si se cambia `printWidth` o `tabWidth` en Prettier, actualizar `.editorconfig`.
