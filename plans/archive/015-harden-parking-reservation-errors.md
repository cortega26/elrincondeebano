# Plan 015: Blindar reserva de estacionamiento contra fallos silenciosos de APIs externas

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 633eeb8..HEAD -- astro-poc/src/scripts/parking-reservation.js`
> If the file changed since this plan was written, compare the "Current state"
> excerpts against the live code; on mismatch, STOP.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (plan 013 recomendado para validación, pero no bloqueante)
- **Category**: bug
- **Planned at**: commit `633eeb8`, 2026-07-14

## Why this matters

Tres bugs en el módulo de estacionamiento que en conjunto permiten reservas inválidas cuando las APIs externas (`feriados.cl`, Google Sheets CSV) están caídas o inalcanzables:

1. **CB-N02**: `fetchHolidays()` y `fetchBookings()` retornan `[]` (array vacío) en cualquier error de fetch. Esto hace que `getNightPrice` siempre cobre tarifa regular (CLP 4,000) incluso en feriados/vísperas (debe ser CLP 5,000), y que `isNightBlocked` siempre retorne `false` permitiendo double-booking.
2. **CB-N03**: `Promise.all([fetchHolidays(), fetchBookings()]).catch(() => { dataReady = true })` marca `dataReady = true` incluso si AMBAS APIs fallaron. El submit handler solo verifica `if (!dataReady)`, no si los datos se cargaron exitosamente. Un error transitorio de red (portal cautivo de WiFi, corte de internet) permite enviar la reserva con precios incorrectos y sin verificación de disponibilidad.

## Current state

### CB-N02: Fallback silencioso a datos vacíos

`astro-poc/src/scripts/parking-reservation.js:54-68`:

```javascript
function fetchHolidays() {
  var cached = getCachedHolidays();
  if (cached) return Promise.resolve(cached);

  return fetch(HOLIDAYS_API_URL)
    .then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(function (data) {
      var dates = (Array.isArray(data) ? data : []).map(function (h) {
        return h.date;
      });
      setCachedHolidays(dates);
      return dates;
    })
    .catch(function () {
      return []; // ← silenciosamente retorna array vacío
    });
}
```

`astro-poc/src/scripts/parking-reservation.js:116-133` — mismo patrón en `fetchBookings()`.

`astro-poc/src/scripts/parking-reservation.js:137-150` — `getNightPrice` itera `holidays.indexOf(dateStr)` — si `holidays` es `[]`, nunca encuentra match → tarifa regular.

### CB-N03: dataReady se marca true en fallo

`astro-poc/src/scripts/parking-reservation.js:514-522`:

```javascript
Promise.all([fetchHolidays(), fetchBookings()])
  .then(function () {
    dataReady = true;
  })
  .catch(function () {
    dataReady = true; // ← BUG: marca ready incluso en fallo total
  });
```

`astro-poc/src/scripts/parking-reservation.js:548-553`:

```javascript
if (!dataReady) {
  showError('Cargando disponibilidad. Intenta de nuevo en unos segundos.');
  return;
}
```

## Commands you will need

| Purpose | Command        | Expected on success |
| ------- | -------------- | ------------------- |
| Test    | `npm test`     | all pass            |
| Lint    | `npm run lint` | exit 0              |

## Scope

**In scope**:

- `astro-poc/src/scripts/parking-reservation.js` — solo las funciones `fetchHolidays`, `fetchBookings`, `getNightPrice`, `isNightBlocked`, y el bloque de inicialización (líneas ~514-522, ~548-553)

**Out of scope** (do NOT touch):

- Caché de holidays/bookings en sessionStorage — funciona correctamente
- UI de fechas y calendario
- Lógica de precios base (`PRICE_REGULAR`, `PRICE_HIGH`)
- Plan 002 (race condition en parking) — diferente issue, no tocar el código que el plan 002 modifica

## Git workflow

- Branch: `advisor/015-harden-parking-errors`
- Commit message: `fix(parking): surface API errors instead of silently degrading to wrong prices and double-booking`
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Propagar error en fetchHolidays y fetchBookings

Cambiar el `.catch(function () { return []; })` para que propague el error en lugar de tragarlo:

En `fetchHolidays` (línea 66-68), reemplazar:

```javascript
    .catch(function () {
      return [];
    });
```

por:

```javascript
    .catch(function (err) {
      console.warn('[parking] No se pudieron cargar los feriados:', err);
      throw err;
    });
```

Mismo cambio en `fetchBookings` (línea 130-132):

```javascript
    .catch(function (err) {
      console.warn('[parking] No se pudieron cargar las reservas:', err);
      throw err;
    });
```

**Verify**: `npm run lint` → exit 0

### Step 2: Distinguir "datos cargados" de "fallo irrecuperable"

Reemplazar el bloque de inicialización (líneas 514-522):

```javascript
Promise.all([fetchHolidays(), fetchBookings()])
  .then(function () {
    dataReady = true;
  })
  .catch(function () {
    dataReady = true;
  });
```

por:

```javascript
var dataLoadFailed = false;

Promise.all([fetchHolidays(), fetchBookings()])
  .then(function () {
    dataReady = true;
  })
  .catch(function (err) {
    console.warn('[parking] Error cargando datos de disponibilidad:', err);
    dataLoadFailed = true;
  });
```

### Step 3: Bloquear submit si los datos fallaron

Modificar el guard del submit handler (línea 548-553):

```javascript
if (!dataReady) {
  showError('Cargando disponibilidad. Intenta de nuevo en unos segundos.');
  return;
}
```

por:

```javascript
if (!dataReady) {
  showError('Cargando disponibilidad. Intenta de nuevo en unos segundos.');
  return;
}
if (dataLoadFailed) {
  showError('No se pudo verificar disponibilidad. Recarga la página e intenta de nuevo.');
  return;
}
```

**Verify**: Revisar que `dataLoadFailed` esté declarada en el scope correcto (mismo scope que `dataReady`, cerca de la línea ~500).

### Step 4: Verificar que el código compila sin errores

```bash
npm run lint
```

**Verify**: exit 0

## Test plan

- Revisar si `test/parking-reservation.spec.js` tiene tests para `fetchHolidays` y `fetchBookings`. Si existen, verificar que sigan pasando.
- Si no hay tests para estos paths de error, no se añaden en este plan (scope S). Verificar manualmente:
  1. Desconectar internet → cargar `/estacionamiento/` → verificar que el botón de submit muestra error, no permite enviar.
  2. Reconectar → recargar → verificar que el flujo normal funciona.

**Verify**: `npm test` → todos los tests pasan

## Done criteria

All must hold:

- [ ] `npm run lint` exits 0
- [ ] `npm test` exits 0
- [ ] `grep -rn "return \[\];" astro-poc/src/scripts/parking-reservation.js` no encuentra matches en fetchHolidays/fetchBookings
- [ ] `grep -rn "dataLoadFailed" astro-poc/src/scripts/parking-reservation.js` encuentra la variable y su uso en el guard del submit
- [ ] No files outside `astro-poc/src/scripts/parking-reservation.js` are modified
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report if:

- El código en `parking-reservation.js` no coincide con los excerpts (drift).
- `npm test` falla después de los cambios.
- `dataReady` o `dataLoadFailed` están en scopes diferentes y el cambio requiere reestructuración mayor.

## Maintenance notes

- Si en el futuro se añade una tercera API externa al `Promise.all`, debe seguir el mismo patrón: propagar error, no tragar.
- Considerar añadir un botón de "reintentar carga" en la UI para que el usuario pueda recargar los datos sin refrescar la página completa (fuera del scope de este plan).
- La variable `dataLoadFailed` debe compartir scope con `dataReady` (~línea 500). Si se refactoriza el módulo a ESM/Typescript, asegurar que ambas variables se exporten o mantengan en el mismo closure.
