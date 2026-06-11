# Plan 009 (Direction/Spike): Selector de horario de retiro/entrega en checkout

> **Tipo**: Design/spike — define la API y UX antes de implementar. No modifica
> código de producción. Al terminar, actualiza `plans/README.md` con el
> resultado.
>
> **Drift check (ejecutar primero)**:
> `git diff --stat 501a0bd..HEAD -- astro-poc/src/pages/index.astro astro-poc/src/scripts/storefront.js astro-poc/src/pages/estacionamiento.astro`

## Status

- **Priority**: P3
- **Effort**: S (spike) / M (implementación completa)
- **Risk**: MED
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `501a0bd`, 2026-06-11

## Por qué importa (contexto del producto)

La página de estacionamiento tiene un date-picker con rangos de fechas y
verificación de disponibilidad en tiempo real. El checkout de grocery, en
contraste, muestra solo "Respuesta: Aprox. 10 minutos" como texto estático.

Si la demanda crece o varía por horario (ej. alta demanda viernes noche), el
operador no puede comunicar slots disponibles ni los usuarios pueden planificar.
El patrón de reserva ya existe en el codebase (parking) — adaptarlo para
grocery es el "adjacent possible" más evidente.

**Evidencia de viabilidad**:

- `estacionamiento.astro` ya tiene date pickers, validación y mensaje WhatsApp con fecha
- El mensaje de WhatsApp de grocery (`storefront.js:1124`) ya incluye toda la
  información del pedido — agregar un slot de retiro es 1 línea más
- Los slots pueden comenzar como lista hardcodeada en un JSON antes de requerir
  backend

## Objetivo del spike

1. Validar con el operador si los slots tienen sentido para la operación actual.
2. Prototipar la UI de selección (radio buttons, dropdown o similar).
3. Definir la estructura del JSON de slots para la primera versión.
4. Estimar el esfuerzo de implementación completa.

## Estado actual relevante

**`astro-poc/src/pages/index.astro` (línea 41)**:

```astro
value: statusMap.get('Respuesta') || 'Aprox. 10 minutos',
```

El texto "Aprox. 10 minutos" proviene de un mapa de status (`storefront-experience.json`).

**`astro-poc/src/scripts/storefront.js` — mensaje WhatsApp (línea ~1050–1025)**:
El mensaje formatea: nombre, items, subtotales, total, método de pago, nota de
entrega. Un campo de horario se insertaría aquí.

**`astro-poc/src/pages/estacionamiento.astro`** — selector de fecha implementado:

```astro
<input type="date" id="check-in" required>
<input type="date" id="check-out" required>
```

## Preguntas a responder antes de implementar

### Q1: ¿El operador puede honrar slots específicos?

Esta es la pregunta más crítica. Si el operador no puede comprometerse a
horarios, el feature añade fricción sin valor. **Verificar con el operador antes
de cualquier UI**.

Si la respuesta es "sí, puedo manejar dos franjas diarias", continuar. Si es
"no, respondo cuando puedo", el feature no es prioritario.

### Q2: ¿Los slots son fijos o dinámicos?

**Opción A — Slots hardcodeados en JSON** (primera versión):

```json
// astro-poc/src/data/storefront-delivery-slots.json
{
  "slots": [
    { "id": "same-day-afternoon", "label": "Hoy 16:00–19:00", "available": true },
    { "id": "next-day-morning", "label": "Mañana 10:00–13:00", "available": true },
    { "id": "next-day-afternoon", "label": "Mañana 16:00–19:00", "available": true }
  ],
  "note": "El operador confirma disponibilidad por WhatsApp."
}
```

**Opción B — Slots desde Google Sheets** (como parking usa para bookings):
`parking-reservation.js:12-15` — ya usa CSV de Google Sheets para disponibilidad.

**Recomendación para spike**: Opción A (hardcodeado). Sin backend para v1.

### Q3: ¿Dónde va la UI en el flujo de checkout?

El flujo actual: "Resolver pedido" → diálogo de confirmación → WhatsApp.

El slot podría ir:

- **En el formulario principal** (antes de "Resolver pedido"), como el
  método de pago y la nota de entrega.
- **En el diálogo de confirmación** (después de hacer clic en "Resolver pedido").

**Recomendación**: en el formulario principal, junto a la nota de entrega.
Mismo patrón que el campo de método de pago.

### Q4: ¿El slot va en el mensaje de WhatsApp?

Sí — debe incluirse en el WhatsApp message formateado. Ejemplo:

```
🕓 *Horario preferido:* Mañana 10:00–13:00
```

## Prototipo de JSON de slots (para el spike)

```json
{
  "delivery_slots": [
    {
      "id": "hoy-tarde",
      "label": "Hoy, 16:00–19:00",
      "whatsapp_label": "hoy entre 16:00 y 19:00",
      "available": true
    },
    {
      "id": "manana-manana",
      "label": "Mañana, 10:00–13:00",
      "whatsapp_label": "mañana entre 10:00 y 13:00",
      "available": true
    },
    {
      "id": "manana-tarde",
      "label": "Mañana, 16:00–19:00",
      "whatsapp_label": "mañana entre 16:00 y 19:00",
      "available": true
    }
  ]
}
```

## Pasos del spike

### Paso 1: Confirmar con el operador

Antes de escribir código, confirmar:

- ¿Puede el operador manejar reservas por franja horaria?
- ¿Cuántas franjas por día son manejables?
- ¿Hay días/horarios donde no hay servicio?

**Si la respuesta es negativa**: este plan queda en HOLD. Documentar en README.

### Paso 2: Crear JSON de slots de prueba

Crear `astro-poc/src/data/storefront-delivery-slots.json` con el formato de
Prototipo Q2 de arriba. Este archivo puede actualizarse manualmente por el
operador sin necesitar redeploy si se sirve dinámicamente, o se puede incluir
en el build si es suficientemente estable.

**Verificar**: `cat astro-poc/src/data/storefront-delivery-slots.json | node -e "require('fs').createReadStream('/dev/stdin').pipe(require('stream').pipeline(process.stdin, process.stdout, ()=>{}))"` → JSON válido.

### Paso 3: Prototype de UI

En el área de checkout (junto a la nota de entrega), agregar:

```html
<!-- Solo para el spike — luego mover al componente Astro correcto -->
<div id="delivery-slot-picker">
  <label><strong>¿Cuándo quieres retirar?</strong></label>
  <div role="group">
    <label><input type="radio" name="deliverySlot" value="hoy-tarde" /> Hoy 16:00–19:00</label>
    <label
      ><input type="radio" name="deliverySlot" value="manana-manana" /> Mañana 10:00–13:00</label
    >
    <label
      ><input type="radio" name="deliverySlot" value="manana-tarde" /> Mañana 16:00–19:00</label
    >
  </div>
</div>
```

Verificar en el browser que los radio buttons se ven bien dentro del formulario
de checkout.

### Paso 4: Agregar slot al mensaje WhatsApp (prototype)

En `storefront.js`, en la función que construye el mensaje de checkout (busca
`wa.me/${WHATSAPP_NUMBER}`), agregar una línea para el slot seleccionado:

```js
const slotLabel =
  document.querySelector('input[name="deliverySlot"]:checked')?.dataset.label || 'No especificado';
// Agregar al mensaje: `🕓 *Horario preferido:* ${slotLabel}`
```

**Verificar**: en el browser, seleccionar un slot y completar el checkout — el
mensaje de WhatsApp debe incluir el horario.

### Paso 5: Documentar preguntas abiertas y estimado

Al terminar el spike:

- ¿La UI encaja bien en el flujo de checkout?
- ¿El mensaje de WhatsApp es más claro con el slot?
- ¿Los slots hardcodeados son suficientes para v1?
- Esfuerzo estimado para implementación completa: S/M/L

## Plan de implementación (post-spike, si viable)

1. Agregar `getDeliverySlots()` a `astro-poc/src/lib/catalog.ts` (lee desde
   `storefront-delivery-slots.json`).
2. Agregar el selector de horario al formulario de checkout en `index.astro`.
3. Actualizar la función de construcción del mensaje WhatsApp en `storefront.js`.
4. Agregar tests: (a) `getDeliverySlots()` retorna slots disponibles; (b) el
   mensaje WhatsApp incluye el slot seleccionado; (c) E2E: slot aparece en el
   form, se selecciona, aparece en preview del mensaje.
5. Actualizar `storefront-experience.json` para reflejar horarios en el status
   de "Respuesta" (o eliminar el texto hardcodeado).

## Criterios de done del spike

- [ ] Pregunta Q1 respondida por el operador (sí/no a slots)
- [ ] Si sí: JSON de slots prototipado y válido
- [ ] Si sí: UI de radio buttons visible en checkout en dev
- [ ] Si sí: mensaje WhatsApp incluye slot seleccionado
- [ ] Preguntas abiertas documentadas en este plan
- [ ] Esfuerzo de implementación completa estimado
- [ ] `plans/README.md` fila actualizada con veredicto

## Notas

- **IMPORTANTE**: No implementar sin confirmación del operador (Q1). El riesgo
  MED de este plan se debe principalmente a que el feature puede generar
  expectativas que el operador no puede cumplir.
- Cuando se implemente, considerar accesibilidad del date/time picker (el
  `<input type="radio">` es más accesible que un `<select>` personalizado).
