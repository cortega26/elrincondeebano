# Plan 016: Corregir guardias truthiness que bloquean limpiar preferencias de usuario

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 633eeb8..HEAD -- astro-poc/src/scripts/storefront.js`
> If the file changed since this plan was written, compare the "Current state"
> excerpts against the live code; on mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `633eeb8`, 2026-07-14

## Why this matters

`savePreferredPayment` y `saveSubstitutionPreference` en `storefront.js:348-362` usan `if (value)` como guardia antes de escribir a localStorage. Esto bloquea escribir strings falsy como `''` (string vacía = "sin preferencia") o `'0'`. Un usuario que selecciona un método de pago y luego intenta desseleccionarlo no puede: la preferencia anterior persiste para siempre, incluso entre sesiones. Aunque no es el money path, es una fuga de estado de usuario que degrada la UX y viola el principio de que el usuario controla sus preferencias.

## Current state

`astro-poc/src/scripts/storefront.js:344-362`:

```javascript
function loadPreferredPayment() {
  return normalizeId(storefrontStorage.loadJson('preferredPayment', ''));
}

function savePreferredPayment(value) {
  if (value) {
    // ← bloquea '', null, 0, '0', false
    storefrontStorage.saveJson('preferredPayment', value);
  }
}

function loadSubstitutionPreference() {
  return normalizeId(storefrontStorage.loadJson('substitutionPreference', 'Preguntar antes'));
}

function saveSubstitutionPreference(value) {
  if (value) {
    // ← mismo problema
    storefrontStorage.saveJson('substitutionPreference', value);
  }
}
```

`storage-contract.ts:105-120` — `writeStorefrontSlot` ya maneja valores `null`/`undefined` (no escribe). La guardia `if (value)` es redundante y dañina para strings vacías.

## Commands you will need

| Purpose | Command        | Expected on success |
| ------- | -------------- | ------------------- |
| Test    | `npm test`     | all pass            |
| Lint    | `npm run lint` | exit 0              |

## Scope

**In scope**:

- `astro-poc/src/scripts/storefront.js:348-362` — solo `savePreferredPayment` y `saveSubstitutionPreference`

**Out of scope** (do NOT touch):

- `loadPreferredPayment` y `loadSubstitutionPreference` — las funciones de lectura ya manejan correctamente valores ausentes con defaults
- `storage-contract.ts` — no se modifica
- Cualquier otro guardia `if (value)` en otros archivos

## Git workflow

- Branch: `advisor/016-fix-preference-clearing`
- Commit message: `fix(storefront): allow clearing payment and substitution preferences`
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Reemplazar guardias

En `astro-poc/src/scripts/storefront.js`, líneas 348-362:

**Antes**:

```javascript
function savePreferredPayment(value) {
  if (value) {
    storefrontStorage.saveJson('preferredPayment', value);
  }
}

function loadSubstitutionPreference() {
  return normalizeId(storefrontStorage.loadJson('substitutionPreference', 'Preguntar antes'));
}

function saveSubstitutionPreference(value) {
  if (value) {
    storefrontStorage.saveJson('substitutionPreference', value);
  }
}
```

**Después**:

```javascript
function savePreferredPayment(value) {
  storefrontStorage.saveJson('preferredPayment', value);
}

function loadSubstitutionPreference() {
  return normalizeId(storefrontStorage.loadJson('substitutionPreference', 'Preguntar antes'));
}

function saveSubstitutionPreference(value) {
  storefrontStorage.saveJson('substitutionPreference', value);
}
```

**Razonamiento**: `saveJson` internamente llama a `writeStorefrontSlot` que ya tiene `if (value === undefined || value === null) { this.remove(slot); return true; }` — no necesitamos una guardia duplicada en el caller.

### Step 2: Verificar que el cambio no rompe nada

```bash
npm run lint && npm test
```

**Verify**: exit 0, todos los tests pasan.

## Test plan

Verificar que `test/cart.spec.js` o cualquier test de storefront que interactúe con preferencias siga pasando. Si no hay tests para `savePreferredPayment`/`saveSubstitutionPreference`, no se añaden en este plan.

## Done criteria

All must hold:

- [ ] `npm run lint` exits 0
- [ ] `npm test` exits 0
- [ ] `grep -rn "if (value)" astro-poc/src/scripts/storefront.js | grep -E "savePreferredPayment|saveSubstitutionPreference"` no encuentra matches (las guardias fueron removidas)
- [ ] No files outside `astro-poc/src/scripts/storefront.js` are modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report if:

- El código en `storefront.js:348-362` no coincide con los excerpts (drift).
- `npm test` falla después del cambio.
- Existen callers que dependen de que `savePreferredPayment`/`saveSubstitutionPreference` no escriban valores falsy (improbable, pero verificar).

## Maintenance notes

- Si en el futuro se añaden más preferencias de usuario con el mismo patrón, NO usar guardias `if (value)` — delegar en `saveJson` que ya maneja `null`/`undefined`.
- Este fix es trivial pero corrige un bug de state management que persiste entre sesiones.
