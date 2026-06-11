# Plan 006: Extraer formatCurrency y WHATSAPP_NUMBER a librería compartida

> **Instrucciones para el ejecutor**: Sigue este plan paso a paso. Ejecuta cada
> verificación antes de avanzar. Si algo en "Condiciones de STOP" ocurre,
> detente e informa — no improvises.
> Al terminar, actualiza la fila de este plan en `plans/README.md`.
>
> **Drift check (ejecutar primero)**:
> `git diff --stat 501a0bd..HEAD -- astro-poc/src/scripts/storefront.js astro-poc/src/scripts/parking-reservation.js`
> Si alguno cambió, compara los excerpts antes de proceder.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `501a0bd`, 2026-06-11

## Por qué importa

`formatCurrency()` y `WHATSAPP_NUMBER` están definidos en dos archivos
independientes con implementaciones **divergentes**:

| Archivo                        | `formatCurrency`                                                                          | `WHATSAPP_NUMBER` |
| ------------------------------ | ----------------------------------------------------------------------------------------- | ----------------- |
| `storefront.js:23,69`          | `Intl.NumberFormat('es-CL', {style:'currency', currency:'CLP', minimumFractionDigits:0})` | `'56951118901'`   |
| `parking-reservation.js:5,193` | `'$' + Number(value).toLocaleString('es-CL')`                                             | `'56951118901'`   |

Las implementaciones producen resultados idénticos hoy, pero divergerán si:

- Se agrega un separador de miles diferente.
- El número de WhatsApp cambia (dos archivos a actualizar, riesgo de olvidar uno).
- Se agrega un tercer módulo (ej. un futuro `delivery.js`) que necesite estas
  utilidades y cree una tercera copia.

La solución es crear `astro-poc/src/lib/formatting.ts` como única fuente de
verdad, y que ambos módulos importen desde ahí.

## Estado actual

**`astro-poc/src/scripts/storefront.js` (líneas 23, 69–74)**:

```js
const WHATSAPP_NUMBER = '56951118901';

function formatCurrency(value) {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    minimumFractionDigits: 0,
  }).format(value);
}
```

**`astro-poc/src/scripts/parking-reservation.js` (líneas 5, 193–195)**:

```js
var WHATSAPP_NUMBER = '56951118901';

function formatCurrency(value) {
  return '$' + Number(value).toLocaleString('es-CL');
}
```

La implementación de `storefront.js` (Intl.NumberFormat) es **más robusta**:
maneja `NaN`, `undefined`, valores negativos correctamente y es la que debe
usarse en el módulo compartido.

`astro-poc/src/lib/` ya tiene otros módulos (`catalog.ts`, `seo.ts`,
`logger.ts`, `product-identity.ts`) — este archivo sigue ese patrón.

## Comandos necesarios

| Propósito | Comando             | Éxito esperado |
| --------- | ------------------- | -------------- |
| Typecheck | `npm run typecheck` | exit 0         |
| Tests     | `npm test`          | exit 0         |
| Lint      | `npm run lint`      | exit 0         |
| Build     | `npm run build`     | exit 0         |

## Alcance

**En scope**:

- `astro-poc/src/lib/formatting.ts` — crear (nuevo archivo)
- `astro-poc/src/scripts/storefront.js` — reemplazar definición local por import
- `astro-poc/src/scripts/parking-reservation.js` — reemplazar definición local por import

**Fuera de scope** (no tocar):

- `astro-poc/src/lib/catalog.ts` — no toca formatCurrency
- `tools/` — los scripts de herramientas tienen sus propias utilidades de
  formatting (build-time, no client-side)
- Cualquier archivo en `src/js/` (legacy)

## Workflow git

- Rama: `refactor/shared-formatting-006`
- Commit: `refactor: extract formatCurrency and WHATSAPP_NUMBER to shared lib`
- NO hacer push ni abrir PR sin instrucción explícita.

## Pasos

### Paso 1: Crear `astro-poc/src/lib/formatting.ts`

Crea el archivo con este contenido exacto:

```ts
export const WHATSAPP_NUMBER = '56951118901';

export function formatCurrency(value: unknown): string {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    minimumFractionDigits: 0,
  }).format(Number(value));
}
```

**Verificar**: `ls astro-poc/src/lib/formatting.ts` → archivo existe.

### Paso 2: Actualizar `storefront.js`

En `astro-poc/src/scripts/storefront.js`:

1. Agrega el import al inicio del archivo, junto a los otros imports (busca el
   bloque de `import` al principio):

   ```js
   import { WHATSAPP_NUMBER, formatCurrency } from '../lib/formatting.js';
   ```

2. Elimina la definición local de `WHATSAPP_NUMBER` (línea 23):

   ```js
   const WHATSAPP_NUMBER = '56951118901'; // ← eliminar esta línea
   ```

3. Elimina la definición local de `formatCurrency` (líneas 69–74):
   ```js
   function formatCurrency(value) {
     // ← eliminar esta función (5 líneas)
     return new Intl.NumberFormat('es-CL', {
       style: 'currency',
       currency: 'CLP',
       minimumFractionDigits: 0,
     }).format(value);
   }
   ```

**Verificar**:

```bash
grep -n "const WHATSAPP_NUMBER\|function formatCurrency" astro-poc/src/scripts/storefront.js
```

→ 0 resultados (definiciones locales eliminadas).

```bash
grep -n "from.*lib/formatting" astro-poc/src/scripts/storefront.js
```

→ 1 resultado (el import agregado).

### Paso 3: Actualizar `parking-reservation.js`

`parking-reservation.js` usa `var` internamente pero se carga en
`astro-poc/src/pages/estacionamiento.astro` vía:

```astro
<script>
  import '../scripts/parking-reservation.js';
</script>
```

Astro procesa los `<script>` con Vite como ESM, por lo que el `import` a
`formatting.js` funcionará aunque `parking-reservation.js` use `var` dentro.
No hay condición de STOP aquí.

Puedes confirmar con:

```bash
grep -n "parking-reservation" astro-poc/src/pages/estacionamiento.astro
```

→ Debe mostrar `import '../scripts/parking-reservation.js';` dentro de un `<script>`.

Entonces:

1. Agrega al inicio del archivo:

   ```js
   import { WHATSAPP_NUMBER, formatCurrency } from '../lib/formatting.js';
   ```

2. Elimina `var WHATSAPP_NUMBER = '56951118901';` (línea 5).

3. Elimina la función `formatCurrency` local (líneas 193–195).

**Verificar**:

```bash
grep -n "var WHATSAPP_NUMBER\|function formatCurrency" astro-poc/src/scripts/parking-reservation.js
```

→ 0 resultados.

### Paso 4: Typecheck y build

```bash
npm run typecheck && npm run build
```

**Verificar**: exit 0 en ambos. Si hay error de TypeScript sobre el `Number(value)`
en `formatting.ts`, el tipo de `value` puede necesitar ajuste (usa `unknown` o
`number | string | null | undefined`).

### Paso 5: Tests y lint

```bash
npm test && npm run lint
```

**Verificar**: exit 0 en ambos.

## Plan de tests

Crea `test/formatting.spec.js`:

```js
import { formatCurrency, WHATSAPP_NUMBER } from '../astro-poc/src/lib/formatting.js';

describe('formatting', () => {
  describe('formatCurrency', () => {
    it('formatea enteros en pesos CLP', () => {
      expect(formatCurrency(1000)).toMatch(/\$\s*1\.?000/);
    });
    it('formatea cero correctamente', () => {
      expect(formatCurrency(0)).toMatch(/\$\s*0/);
    });
    it('no incluye decimales', () => {
      expect(formatCurrency(1000)).not.toMatch(/,\d{2}$/);
    });
  });

  describe('WHATSAPP_NUMBER', () => {
    it('es el número de WhatsApp correcto', () => {
      expect(WHATSAPP_NUMBER).toBe('56951118901');
    });
  });
});
```

**Verificar**: `npm test` → exit 0, incluyendo los tests nuevos.

## Criterios de done

- [ ] `ls astro-poc/src/lib/formatting.ts` → existe
- [ ] `grep -n "WHATSAPP_NUMBER\|formatCurrency" astro-poc/src/lib/formatting.ts` → ambos definidos
- [ ] `grep "const WHATSAPP_NUMBER\|function formatCurrency" astro-poc/src/scripts/storefront.js` → 0 resultados
- [ ] `grep "var WHATSAPP_NUMBER\|function formatCurrency" astro-poc/src/scripts/parking-reservation.js` → 0 resultados (o STOP documenta por qué no aplica)
- [ ] `npm run typecheck` → exit 0
- [ ] `npm run build` → exit 0
- [ ] `npm test` → exit 0 con tests nuevos de formatting
- [ ] `plans/README.md` fila actualizada a DONE

## Condiciones de STOP

Detente e informa si:

- El build falla porque `formatting.js` no puede ser importado desde
  `parking-reservation.js` (ej. rutas de build distintas o error de Vite al
  resolver la ruta relativa `../lib/formatting.js`).
- `storefront.js` tiene más de 2 ocurrencias de `WHATSAPP_NUMBER` o
  `formatCurrency` que no sean las definiciones (indicaría uso adicional a verificar).

## Notas de mantenimiento

- Al agregar nuevas constantes globales (teléfono de soporte, límites de
  horario, etc.), considerar `formatting.ts` o un nuevo `astro-poc/src/lib/constants.ts`.
- Si el número de WhatsApp cambia, solo se modifica `astro-poc/src/lib/formatting.ts`.
