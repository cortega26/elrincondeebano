# Plan 017: Escapar `</script>` en `JSON.stringify` para bloques JSON-LD y datos inline

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 633eeb8..HEAD -- astro-poc/src/components/StructuredData.astro astro-poc/src/pages/index.astro astro-poc/src/pages/combos.astro`
> If these files changed since this plan was written, compare the "Current
> state" excerpts against the live code; on mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `633eeb8`, 2026-07-14

## Why this matters

Astro's `set:html` directive inyecta texto como HTML sin procesar dentro de tags `<script>`. Cuando se usa `JSON.stringify()` para serializar datos de build-time (nombres de productos, descripciones, SKUs, reglas de bundles) dentro de `<script type="application/ld+json">` o `<script type="application/json">`, la secuencia de bytes `</script>` NO es escapada por `JSON.stringify`. Si cualquier dato del catálogo contiene literalmente `</script>`, el parser HTML cierra el tag prematuramente, corrompiendo la estructura de la página. Aunque la CSP mitiga la ejecución de scripts inline, el daño estructural puede romper la funcionalidad de la página (datos JSON-LD inválidos, storefront experience ilegible para el JS del cliente).

## Current state

Tres ubicaciones usan `set:html` con `JSON.stringify`:

1. `astro-poc/src/components/StructuredData.astro:189`:

```astro
<script type="application/ld+json" set:html={JSON.stringify(jsonLd)}>
```

2. `astro-poc/src/pages/index.astro:182`:

```astro
<script type="application/json" id="storefront-experience-data" set:html={JSON.stringify(storefrontExperience)}>
```

3. `astro-poc/src/pages/combos.astro:53`:

```astro
<script type="application/json" id="storefront-experience-data" set:html={JSON.stringify(storefrontExperience)}>
```

## Commands you will need

| Purpose   | Command             | Expected on success |
| --------- | ------------------- | ------------------- |
| Build     | `npm run build`     | exit 0              |
| Typecheck | `npm run typecheck` | exit 0, no errors   |
| Lint      | `npm run lint`      | exit 0              |
| Test      | `npm test`          | all pass            |
| E2E       | `npm run test:e2e`  | all pass            |

## Scope

**In scope**:

- `astro-poc/src/components/StructuredData.astro` — solo la línea con `JSON.stringify(jsonLd)`
- `astro-poc/src/pages/index.astro` — solo la línea con `JSON.stringify(storefrontExperience)`
- `astro-poc/src/pages/combos.astro` — solo la línea con `JSON.stringify(storefrontExperience)`

**Out of scope** (do NOT touch):

- Cualquier otro uso de `set:html` en el proyecto
- Plan 003 (innerHTML en notificaciones) — diferente issue
- Plan 012 (unificar CSP) — diferente issue

## Git workflow

- Branch: `advisor/017-escape-script-in-json`
- Commit message: `fix(security): escape </script> in JSON.stringify for inline script blocks`
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Crear helper de escape

Crear `astro-poc/src/lib/serialization.ts`:

```typescript
export function safeScriptJSON(value: unknown): string {
  return JSON.stringify(value).replace(/<\//g, '<\\/');
}
```

Este helper reemplaza `</` por `<\/` en el JSON serializado. Es seguro porque `\/` es una secuencia de escape válida en strings JSON (representa `/`) y el parser HTML no interpreta `<\/` como cierre de tag.

**Verify**: El archivo existe en `astro-poc/src/lib/serialization.ts`.

### Step 2: Reemplazar `JSON.stringify` por `safeScriptJSON`

En `StructuredData.astro`, agregar el import al frontmatter:

```astro
---
import { safeScriptJSON } from '../lib/serialization';
// ... resto de imports ...
---
```

Cambiar línea 189 de:

```astro
<script type="application/ld+json" set:html={JSON.stringify(jsonLd)}>
```

a:

```astro
<script type="application/ld+json" set:html={safeScriptJSON(jsonLd)}>
```

En `index.astro`, agregar el import y cambiar línea 182 de:

```astro
<script type="application/json" id="storefront-experience-data" set:html={JSON.stringify(storefrontExperience)}>
```

a:

```astro
<script type="application/json" id="storefront-experience-data" set:html={safeScriptJSON(storefrontExperience)}>
```

En `combos.astro`, mismo cambio para línea 53.

**Verify**: `npm run typecheck` → exit 0, no errors

### Step 3: Validación completa

```bash
npm run build && npm run lint && npm test && npm run test:e2e
```

**Verify**: todos exit 0.

## Test plan

Añadir `test/serialization.spec.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { safeScriptJSON } from '../astro-poc/src/lib/serialization';

describe('safeScriptJSON', () => {
  it('escapes closing script tag', () => {
    const input = { name: 'test</script><script>alert(1)' };
    const result = safeScriptJSON(input);
    expect(result).not.toContain('</script>');
    expect(result).toContain('<\\/script>');
  });

  it('handles normal JSON unchanged', () => {
    const input = { a: 1, b: 'hello' };
    const result = safeScriptJSON(input);
    expect(JSON.parse(result)).toEqual(input);
  });

  it('handles nested objects with closing tags', () => {
    const input = { items: [{ name: 'x</p>' }, { name: 'y</div>' }] };
    const result = safeScriptJSON(input);
    expect(result).not.toContain('</p>');
    expect(result).not.toContain('</div>');
    expect(result).toContain('<\\/p>');
    expect(result).toContain('<\\/div>');
  });

  it('handles empty and primitive values', () => {
    expect(safeScriptJSON(null)).toBe('null');
    expect(safeScriptJSON('hello')).toBe('"hello"');
    expect(safeScriptJSON(42)).toBe('42');
  });
});
```

**Verify**: `npm test` → todos los tests pasan, incluyendo los 4 nuevos.

## Done criteria

All must hold:

- [ ] `npm run typecheck` exits 0
- [ ] `npm run lint` exits 0
- [ ] `npm test` exits 0 (incluye nuevos tests de `serialization.spec.ts`)
- [ ] `npm run build` exits 0
- [ ] `npm run test:e2e` exits 0
- [ ] `grep -rn "JSON.stringify" astro-poc/src/components/StructuredData.astro astro-poc/src/pages/index.astro astro-poc/src/pages/combos.astro` no encuentra matches (todos usan `safeScriptJSON`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report if:

- Los archivos listados en "Current state" no contienen `set:html={JSON.stringify(...)` (drift).
- `npm run build` produce errores nuevos de Astro.
- `npm run test:e2e` falla con errores de datos faltantes en el storefront (JSON mal formado).
- El helper `safeScriptJSON` está disponible en los tres archivos pero el typecheck falla por paths de import incorrectos.

## Maintenance notes

- Cada vez que se añada un nuevo `set:html` con `JSON.stringify` en un tag `<script>`, usar `safeScriptJSON` en lugar de `JSON.stringify` directamente.
- El helper escapa `</` globalmente, lo cual es conservador: escapa `</p>`, `</div>`, etc. aunque solo `</script>` es peligroso en contexto de script tag. Esto es intencional — previene también inyección en otros contextos HTML donde `</` cierra tags.
- Relacionado con el plan 003 (innerHTML) y plan 012 (CSP) — pero este fix es independiente y debe aplicarse sin esperar esos planes.
