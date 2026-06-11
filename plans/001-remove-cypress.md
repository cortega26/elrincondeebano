# Plan 001: Eliminar Cypress y sus vulnerabilidades transitivas

> **Instrucciones para el ejecutor**: Sigue este plan paso a paso. Ejecuta cada
> comando de verificación antes de avanzar al siguiente paso. Si algo en la
> sección "Condiciones de STOP" ocurre, detente e informa — no improvises.
> Al terminar, actualiza la fila de este plan en `plans/README.md`.
>
> **Drift check (ejecutar primero)**:
> `git diff --stat 501a0bd..HEAD -- package.json package-lock.json cypress.config.ts`
> Si alguno de estos archivos cambió desde que se escribió este plan, compara
> los excerpts de "Estado actual" contra el código vivo antes de proceder.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: deps / security
- **Planned at**: commit `501a0bd`, 2026-06-11

## Por qué importa

Cypress está instalado como `devDependency` pero **ningún workflow de CI lo
ejecuta** — la carpeta `cypress/` tiene solo 2 archivos de test que no forman
parte de ningún gate de calidad. Como consecuencia, Cypress y sus ~300
dependencias transitivas se instalan en cada `npm ci`, inflan el `package-lock.json`
e introducen dos vulnerabilidades que bloquean `npm audit --omit=dev`:

- **GHSA-ph9p-34f9-6g65** — `tmp < 0.2.6`: path traversal en creación de
  archivos temporales (Cypress → @cypress/request → tmp@0.2.5).
- **GHSA-q8mj-m7cp-5q26** — `qs < 6.15.2`: TypeError DoS al codificar arrays
  nulos con `encodeValuesOnly` (Cypress → @cypress/request → qs@6.15.0).

Eliminar Cypress resuelve ambas vulnerabilidades, reduce el tiempo de install y
elimina la confusión de tener dos frameworks E2E (Playwright es el activo).

## Estado actual

**`package.json` (línea 84)**:

```json
"cypress": "^15.15.0"
```

**Script en `package.json` (línea 49)**:

```json
"test:cypress": "node scripts/run-cypress.mjs --spec cypress/e2e/nav_menu.cy.ts"
```

**Archivos en `cypress/`**:

```
cypress/e2e/nav_menu.cy.ts
cypress/e2e/submenu_on_subpages.cy.ts
```

**`cypress.config.ts`**: existe en la raíz.

**CI**: cero referencias a Cypress en `.github/workflows/` (verificado con
`grep -r "cypress" .github/workflows/` → 0 resultados).

El framework E2E activo es Playwright: 14 specs en `test/e2e-astro/`, invocado
como `npm run test:e2e` en CI.

## Comandos necesarios

| Propósito  | Comando                | Éxito esperado                   |
| ---------- | ---------------------- | -------------------------------- |
| Reinstall  | `npm ci`               | exit 0                           |
| Audit prod | `npm audit --omit=dev` | 0 vulnerabilidades high/critical |
| Tests      | `npm test`             | exit 0                           |
| E2E        | `npm run test:e2e`     | exit 0                           |
| Lint       | `npm run lint`         | exit 0                           |

## Alcance

**En scope** (únicos archivos a modificar/eliminar):

- `package.json` — eliminar dep `cypress` y script `test:cypress`
- `package-lock.json` — se regenera con `npm ci` tras el cambio
- `cypress.config.ts` — eliminar
- `cypress/` — eliminar directorio completo
- `scripts/run-cypress.mjs` — eliminar si existe solo para Cypress
- `test/run-cypress.test.js` y su entrada en `test/run-all.js` — eliminar si
  el runner se elimina

**Fuera de scope** (no tocar):

- `playwright.astro.config.ts` — framework E2E activo, no modificar
- `playwright.config.ts` — no modificar
- `test/e2e-astro/` — no modificar
- `astro-poc/` — no modificar

## Workflow git

- Rama: `fix/remove-cypress-001`
- Estilo de commit: `chore(deps): remove unused cypress dependency` (conventional commits)
- NO hacer push ni abrir PR sin instrucción explícita.

## Pasos

### Paso 1: Eliminar archivos de Cypress

```bash
rm -f cypress.config.ts
rm -rf cypress/
```

Verifica: `ls cypress.config.ts 2>/dev/null || echo "OK - eliminado"` → debe
imprimir "OK - eliminado".

**Verificar también**: `ls cypress/e2e/ 2>/dev/null || echo "OK - eliminado"` → "OK - eliminado".

### Paso 2: Eliminar `run-cypress.mjs` si existe solo para Cypress

```bash
ls scripts/run-cypress.mjs 2>/dev/null && echo "existe" || echo "no existe"
```

Si existe, ábrelo y verifica que su único propósito sea ejecutar Cypress.
Si es así: `rm scripts/run-cypress.mjs`.

**Verificar**: `ls scripts/run-cypress.mjs 2>/dev/null || echo "OK"`.

### Paso 3: Actualizar `package.json`

En `package.json`:

1. Eliminar la línea de `"cypress": "^15.15.0"` del bloque `devDependencies`.
2. Eliminar el script `"test:cypress": "node scripts/run-cypress.mjs --spec cypress/e2e/nav_menu.cy.ts"`.

Después del cambio, el bloque `devDependencies` NO debe contener `cypress`.
El bloque `scripts` NO debe contener `test:cypress`.

**Verificar**: `grep -n "cypress" package.json` → 0 resultados.

### Paso 4: Regenerar lockfile y verificar instalación

```bash
npm install --package-lock-only --ignore-scripts
npm ci
```

**Verificar**: ambos comandos con exit 0 y sin mensajes de error. El
`package-lock.json` se actualiza con `npm install --package-lock-only`; `npm ci`
solo verifica que el lockfile ya está sincronizado.

### Paso 5: Confirmar que las vulnerabilidades se resolvieron

```bash
npm audit --omit=dev
```

**Verificar**: salida no debe incluir `tmp`, `@cypress/request`, `qs` ni
mencionar GHSA-ph9p-34f9-6g65 ni GHSA-q8mj-m7cp-5q26.

Si quedan vulnerabilidades HIGH/CRITICAL no relacionadas a Cypress, documéntalas
pero NO intentes resolverlas en este plan (están fuera de scope).

### Paso 6: Ejecutar suite de tests

```bash
npm test
```

**Verificar**: exit 0. Si falla algún test, **no** está relacionado con esta
remoción — documenta el fallo y reporta; no intentes corregir tests en este plan.

### Paso 7: Ejecutar lint

```bash
npm run lint
```

**Verificar**: exit 0, 0 warnings.

## Plan de tests

No se requieren tests nuevos — este es un cambio de eliminación. La verificación
es que los tests existentes sigan pasando sin Cypress.

## Criterios de done

- [ ] `rm -f cypress.config.ts; ls cypress.config.ts 2>/dev/null || echo OK` → "OK"
- [ ] `ls cypress/ 2>/dev/null || echo OK` → "OK"
- [ ] `ls scripts/run-cypress.mjs test/run-cypress.test.js 2>/dev/null || echo OK` → "OK"
- [ ] `grep "cypress" package.json` → 0 resultados
- [ ] `npm audit --omit=dev` → sin high/critical que mencionen Cypress
- [ ] `npm test` → exit 0
- [ ] `npm run lint` → exit 0
- [ ] `plans/README.md` fila actualizada a DONE

## Condiciones de STOP

Detente e informa si:

- `npm ci` falla por algún motivo no relacionado a Cypress.
- Algún test rompe después de la eliminación (indicaría dependencia oculta en
  tests de `node:test` o Vitest sobre la API de Cypress — improbable pero posible).
- Encuentras imports de `cypress` en archivos distintos a los listados en Scope.

## Notas de mantenimiento

- Si en el futuro se desea volver a agregar tests E2E adicionales, usar
  Playwright (framework ya activo) — no re-introducir Cypress.
- El `stryker.conf.mjs` también tiene su propia config que no depende de
  Cypress; no se ve afectado.
