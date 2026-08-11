# Plan 089: Arreglar el workbench OG — intents aplicables y staging honesto

> Auditoría 8 (2026-08-11). Finding 6. Blocker del retiro de Python.

## Status

- **Priority**: P0
- **Effort**: S
- **Risk**: LOW-MED — toca el apply del media workbench; la e2e `playwright.media.config.ts` es la red de seguridad
- **Depends on**: —
- **Category**: media / correctness
- **Written against**: commit `cefdd9f`

## Why this matters

El workflow OG ("Generar OG"/"Eliminar OG" → Ejecutar → Aplicar) falla SIEMPRE
en el último paso: `runCategoryOgJob` declara como output un path CANÓNICO
(`assets/images/og/categories/<slug>.png`) y `apply` rechaza 422
`MISSING_OUTPUT` todo output fuera de `stagingRoot`. Mientras tanto el tool ya
escribió/borró el archivo canónico al ejecutar — el operador ve un error y el
filesystem cambió; el intent queda `succeeded` para siempre con la UI en error.
Ningún test cubre intents OG (grep `runCategoryOgJob|og-delete` en `test/`: 0).

## Current state

- `src/server/services/mediaJobs.ts:138-141`:
  ```ts
  return {
    ok: true,
    outputs: [resolve(input.repoRoot, 'assets', 'images', 'og', 'categories', `${slug}.png`)],
  };
  ```
- `src/server/routes/media.ts:384-390` — apply: `if (!output.startsWith(intents.stagingRoot) || !existsSync(output)) return 422 MISSING_OUTPUT`.
- `mediaJobs.ts:101-104` — el job ya hace `spawn(tools/category_og, ...)` escribiendo el canónico al ejecutar (viola "nunca canónico hasta apply").

## Scope

**In scope**: `mediaJobs.ts`, `media.ts` (apply), `MediaPage.tsx` (estado del intent OG), tests.
**Out of scope**: el tool `tools/category_og` (se sigue usando como herramienta canónica), otros intents (avif/variant ya funcionan vía staging).

## Steps

### Step 1: Decidir el contrato de apply para OG

El tool OG escribe el canónico en RUN (no produce un archivo staged). Dos opciones válidas — elegir por test:

- **A. No-op transicional**: para `og`/`og-delete`, `apply` NO exige outputs staged; verifica que el canónico exista (para `og`) o no exista (para `og-delete`) y transiciona el intent a `applied`. El "rollback" de apply para OG = re-ejecutar el job inverso (documentar en el intent).
- **B. Ejecución diferida**: el job NO escribe; `apply` corre el tool y valida el output canónico. Cambia el momento del spawn (run ≠ apply) — más invasivo.

Recomendación: **A**, porque mantiene el jobRunner/UI intactos y solo corrige el contrato de outputs.

### Step 2: Implementar y marcar outputs

- En `runCategoryOgJob`, para `operation: 'og'` devolver `outputs: []` + un flag `kind: 'canonical'` (o un campo `output_kind: 'og'`) en el resultado para que el apply sepa qué validar.
- En `apply` (media.ts): si `intent.kind === 'og'`, validar el canónico (existe/no-existe según operación) y transicionar a `applied`; no pasar por el loop de promote.
- Persistir en el intent un `output_note` con el path canónico validado.

**Verificar**: test integración `mediaWorkbench.test.ts` (o nuevo `mediaOg.test.ts`): crear intent `og` → run (fake del tool vía stub de spawn o `category_og` real si el entorno tiene el tool) → apply → 200 y estado `applied`; `og-delete` → apply tras borrar → 200. Caso negativo: el canónico NO existe → 422 `MISSING_OUTPUT` honesto.

### Step 3: UI

- `MediaPage.tsx:377-379`: el botón "Aplicar" para intents OG `succeeded` funciona igual (sin cambios visibles) — verificar el mensaje de éxito no mencione "staged".
- Si el apply OG falla (canónico ausente), mostrar el error del intent y permitir re-run.

### Step 4: Suite

```bash
npm run admin:test && npx playwright test -c playwright.media.config.ts && npm run admin:certify
```

## Test plan

- `test/integration/mediaWorkbench.test.ts` o `test/contract/media.test.ts`: +2 casos OG (generar/eliminar) + 1 negativo (canónico ausente).
- Confirmar que los intents avif/variant existentes no cambian (regresión).

## Done criteria

- [ ] Intent OG: run → apply → `applied` con validación del canónico.
- [ ] og-delete: apply verifica ausencia del canónico.
- [ ] Intents avif/variant siguen verdes (suite + e2e media).

## STOP conditions

- Si el entorno no tiene `tools/category_og` funcional (requiere python3), NO saltar la validación: stubbear el spawn en tests y documentar el requisito runtime (ya existe nota en plan 063).

## Maintenance notes

El workbench media mantiene el invariante "nunca canónico hasta apply" para avif/variant; OG es la excepción documentada porque el tool canónico escribe en run. Si el tool cambia a modo stage-dir, volver al contrato estándar.
