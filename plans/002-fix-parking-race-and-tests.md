# Plan 002: Corregir race condition en parking reservation + añadir tests

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.

> **Drift check (run first)**: `git diff --stat 4751633..HEAD -- astro-poc/src/scripts/parking-reservation.js test/`
> Si el archivo cambió desde que se escribió este plan, compara los excerpts contra el código vivo; si hay mismatch, STOP.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug + tests
- **Planned at**: commit `4751633`, 2026-06-14

## Why this matters

El módulo de reserva de estacionamiento (`parking-reservation.js`, 576 líneas) es un **money path**: calcula precios con tarifas diferenciadas (normal vs. alta temporada), valida fechas contra feriados de la API de feriados.cl y bloqueos desde Google Sheets CSV, y genera un mensaje de WhatsApp con el breakdown completo. Tiene **cero tests**.

El bug (CB-02): `initParkingReservation` inicializa `holidays = []` y `bookings = []`, dispara `fetchHolidays()` y `fetchBookings()` sin `await`, y registra event listeners que llaman `onDateChange(holidays, bookings)` inmediatamente — con los arrays vacíos. Si el usuario interactúa con el date picker antes de que las promesas resuelvan (~100-500ms), ve precios incorrectos (sin recargos de feriados, sin noches bloqueadas).

## Current state

### Archivo principal

`astro-poc/src/scripts/parking-reservation.js` — 576 líneas. Funciones exportadas vía `import`: `WHATSPP_NUMBER`, `formatCurrency` desde `../lib/formatting.js`. Sin exports propios — se auto-inicializa al final del archivo.

### El bug (CB-02)

```javascript
// parking-reservation.js:492-542 (initParkingReservation)
function initParkingReservation() {
  var checkin = document.getElementById('parking-checkin');
  var checkout = document.getElementById('parking-checkout');
  var submitBtn = document.getElementById('parking-submit');

  if (!checkin || !checkout || !submitBtn) return;

  // ... setup de min/max en inputs ...

  var holidays = []; // ← inicializado vacío
  var bookings = []; // ← inicializado vacío

  fetchHolidays().then(function (result) {
    holidays = result; // ← se llena asíncronamente
  });

  fetchBookings().then(function (result) {
    bookings = result; // ← se llena asíncronamente
  });

  // Event listeners usan holidays/bookings INMEDIATAMENTE
  checkin.addEventListener('change', function () {
    // ...
    onDateChange(holidays, bookings); // ← arrays posiblemente vacíos
  });

  checkout.addEventListener('change', function () {
    onDateChange(holidays, bookings); // ← arrays posiblemente vacíos
  });

  submitBtn.addEventListener('click', function (e) {
    e.preventDefault();
    onSubmit(holidays, bookings); // ← arrays posiblemente vacíos
  });
}
```

### Funciones a testear

- `dateToISO(d)` — línea 20: convierte Date a string ISO
- `parseBookingsCSV(csvText)` — línea 96: parsea CSV de Google Sheets
- `isNightBlocked(dateStr, bookings)` — línea 109: verifica si una fecha está bloqueada
- `getNightPrice(date, holidays)` — línea ~140: determina precio según feriados
- `calculateBreakdownPrice(checkIn, checkOut, holidays, bookings)` — línea ~377: calcula subtotal, recargos y total
- `buildWhatsAppMessage(params)` — construye el mensaje para WhatsApp
- `initParkingReservation()` — wiring de DOM y event listeners

### Convenciones del repo

- Tests nuevos en `test/` como `*.spec.js` (Vitest) o `*.test.js` (node:test).
- Usar `jsdom` para simular DOM en tests (ya es devDependency).
- Seguir patrón de `test/checkout.test.js` para tests con DOM.
- Prettier: `semi: true`, `singleQuote: true`, `trailingComma: 'es5'`.

## Commands

| Purpose   | Command             | Expected on success |
| --------- | ------------------- | ------------------- |
| Typecheck | `npm run typecheck` | exit 0              |
| Tests     | `npm test`          | all pass            |
| Lint      | `npm run lint`      | exit 0              |
| Format    | `npm run format`    | exit 0              |

## Scope

**In scope**:

- `astro-poc/src/scripts/parking-reservation.js` — fix de race condition
- `test/parking-reservation.spec.js` — crear, tests unitarios + integración

**Out of scope**:

- `astro-poc/src/pages/estacionamiento.astro` — template Astro, no se modifica
- `astro-poc/src/lib/formatting.ts` — no se modifica
- La API de feriados.cl o Google Sheets — son externas
- Cualquier cambio visual en la página de estacionamiento

## Git workflow

- Branch: `advisor/002-fix-parking-race-and-tests`
- Commit messages: conventional commits (`fix: ...`, `test: ...`)
- No push/PR sin indicación.

## Steps

### Step 1: Corregir la race condition

En `initParkingReservation` (línea ~492), reemplazar las promises independientes por `Promise.all` y registrar los event listeners solo después de que ambas resuelvan:

```javascript
function initParkingReservation() {
  var checkin = document.getElementById('parking-checkin');
  var checkout = document.getElementById('parking-checkout');
  var submitBtn = document.getElementById('parking-submit');

  if (!checkin || !checkout || !submitBtn) return;

  var today = new Date();
  var maxDate = new Date(today);
  maxDate.setDate(maxDate.getDate() + MAX_NIGHTS);
  var todayStr = dateToISO(today);
  var maxStr = dateToISO(maxDate);

  checkin.min = todayStr;
  checkin.max = maxStr;
  checkout.min = todayStr;
  checkout.max = maxStr;

  var holidays = [];
  var bookings = [];
  var dataReady = false;

  Promise.all([fetchHolidays(), fetchBookings()])
    .then(function (results) {
      holidays = results[0];
      bookings = results[1];
      dataReady = true;
    })
    .catch(function () {
      // Holidays y bookings ya tienen fallback a [] en sus respectivas funciones
      dataReady = true;
    });

  function onDateChangeGuarded() {
    if (!dataReady) return;
    onDateChange(holidays, bookings);
  }

  checkin.addEventListener('change', function () {
    if (checkin.value) {
      var dayAfter = new Date(checkin.valueAsNumber);
      dayAfter.setDate(dayAfter.getDate() + 1);
      checkout.min = dateToISO(dayAfter);
      if (!checkout.value || checkout.valueAsNumber <= checkin.valueAsNumber) {
        checkout.value = '';
      }
      clearBreakdown();
      setStatusMessage('', '');
    }
    onDateChangeGuarded();
  });

  checkout.addEventListener('change', function () {
    onDateChangeGuarded();
  });

  submitBtn.addEventListener('click', function (e) {
    e.preventDefault();
    if (!dataReady) {
      setStatusMessage('Cargando disponibilidad...', 'text-muted');
      return;
    }
    onSubmit(holidays, bookings);
  });

  // ... resto de la función sin cambios ...
}
```

**Verify**: `npm run lint` → exit 0

### Step 2: Crear tests unitarios para funciones puras

Crear `test/parking-reservation.spec.js` con Vitest:

```javascript
import { describe, it, expect } from 'vitest';

// Las funciones puras deben ser extraídas/exportadas para testeo.
// Si no están exportadas, añadir exports nombrados en parking-reservation.js
// manteniendo compatibilidad con el IIFE/auto-init existente.
```

**Verify**: `npm test` → los nuevos tests pasan

### Step 3: Ejecutar validación completa

```bash
npm run typecheck && npm run lint && npm test
```

**Verify**: exit 0 en todos.

## Test plan

### Tests unitarios (sin DOM)

1. **`dateToISO`**: verificar que `dateToISO(new Date(2026, 0, 15))` retorna `'2026-01-15'`.
2. **`dateToISO` con mes/día de un dígito**: verificar padding con cero.
3. **`parseBookingsCSV` con CSV válido**: verificar que parsea `"2026-01-01,2026-01-05\n2026-02-01,2026-02-03"` en array de objetos `{desde, hasta}`.
4. **`parseBookingsCSV` vacío**: retorna `[]`.
5. **`parseBookingsCSV` con solo header**: retorna `[]`.
6. **`isNightBlocked` — fecha dentro de bloqueo**: retorna `true`.
7. **`isNightBlocked` — fecha fuera de bloqueo**: retorna `false`.
8. **`isNightBlocked` — fecha en边界 exacto**: fecha igual a `desde` o `hasta` retorna `true`.
9. **`getNightPrice` — fecha normal**: retorna `PRICE_REGULAR` (4000).
10. **`getNightPrice` — fecha de feriado**: retorna `PRICE_HIGH` (5000).
11. **`calculateBreakdownPrice` — sin feriados**: verifica subtotal, recargos ($0), total.
12. **`calculateBreakdownPrice` — con feriados**: verifica recargos aplicados correctamente.
13. **`calculateBreakdownPrice` — con noches bloqueadas**: verifica que las noches bloqueadas aparecen en el breakdown.
14. **`buildWhatsAppMessage`**: verifica que incluye fechas, subtotal, recargos, total, y datos de contacto.

### Tests de integración (con jsdom)

15. **Race condition**: simular `fetchHolidays` y `fetchBookings` con promises controladas, verificar que `onDateChange` no se llama hasta que ambas resuelven.
16. **Submit bloqueado durante carga**: verificar que `onSubmit` muestra mensaje de espera si se llama antes de que los datos lleguen.

### Patrón a seguir

Modelar según `test/checkout.test.js` para tests con jsdom y `test/formatting.spec.js` para tests de funciones puras.

## Done criteria

- [ ] `npm run typecheck` exits 0
- [ ] `npm run lint` exits 0
- [ ] `npm test` exits 0; parking-reservation.spec.js existe con ≥14 tests pasando
- [ ] `initParkingReservation` usa `Promise.all` y los event listeners no llaman `onDateChange`/`onSubmit` hasta que los datos están listos
- [ ] No files outside the in-scope list are modified (`git status`)

## STOP conditions

- Si `parking-reservation.js` no coincide con los excerpts.
- Si las funciones puras (`dateToISO`, `parseBookingsCSV`, etc.) no se pueden extraer sin romper el auto-init.
- Si un test falla dos veces tras intento razonable de fix.
- Si jsdom no está disponible o no puede simular `sessionStorage` correctamente.

## Maintenance notes

- Las funciones `fetchHolidays` y `fetchBookings` usan `sessionStorage` como cache. Los tests deben limpiar `sessionStorage` antes de cada test.
- Si en el futuro se añaden más APIs externas al parking, mantener el patrón `Promise.all` + flag `dataReady`.
- Los tests asumen que `PRICE_REGULAR = 4000` y `PRICE_HIGH = 5000`. Si estos valores cambian, actualizar los tests.
