# Prompt 10 - Contratos (2026-02-13)

## Objetivo

Hacer explícitos y verificables los contratos críticos de catálogo/productos sin romper comportamiento de producción.

## Contratos identificados y estado

1. `data/category_registry.json` (categorías y navegación)
   - Estado: **Verde**
   - Validación activa: `tools/utils/category-registry.js` + `test/category-registry.contract.test.js`.
2. `data/product_data.json` (productos + inventario/disponibilidad + metadata de revisión)
   - Estado: **Verde (nuevo contrato formal)**
   - Validación activa: `tools/utils/product-contract.js` + `test/product-data.contract.test.js`.
3. Referencias cruzadas producto -> categoría
   - Estado: **Verde**
   - Validación activa: `tools/validate-category-registry.js`.
4. Typecheck global del frontend (`tsc -p tsconfig.typecheck.json`)
   - Estado: **Rojo (deuda previa, no introducida en este prompt)**.

## Cambios aplicados

1. Nuevo módulo de contrato de productos:
   - Archivo: `tools/utils/product-contract.js`
   - Reglas principales:
     - `product_data.version`: string no vacío
     - `product_data.last_updated`: fecha ISO válida
     - `product_data.rev`: entero no negativo
     - `products[]`: estructura mínima y tipos esperados
     - precios/descuentos consistentes (`discount <= price`)
     - `stock` e `is_archived` booleanos
     - rutas de imágenes locales seguras (sin `http(s)://`, sin `..`, sin `\`)
     - validación de `field_last_modified` cuando existe
2. Integración del contrato en la validación principal:
   - Archivo: `tools/validate-category-registry.js`
   - Se ejecuta en un mismo gate:
     - contrato de categorías
     - contrato de productos
     - referencias de categoría
3. Nuevos tests de contrato:
   - Archivo: `test/product-data.contract.test.js`
   - Cobertura:
     - fixture real válida
     - payload top-level inválido
     - producto inválido con múltiples errores (incluye categoría desconocida)
4. Inclusión del test en la suite legacy:
   - Archivo: `test/run-all.js`

## Evidencia de verificación

1. `npm run lint` (Node 22): **OK**
2. `npm test` (Node 22): **OK**
3. `npm run build` (Node 22): **OK**
4. `npm run typecheck` (Node 22): **FAIL (deuda previa, múltiples errores históricos de JSDoc/TS config e imports .mts)**

Nota de entorno: en esta sesión el `PATH` no exponía Node correctamente y el binario por defecto era Node 25. Se ejecutó la validación con Node 22 usando:

```powershell
npx -y node@22 "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" <script>
```

## Riesgos restantes

1. `typecheck` sigue en rojo por deuda estructural preexistente.
2. El contrato de productos ahora es explícito; cambios futuros en `product_data.json` que antes pasaban silenciosamente ahora fallarán temprano (comportamiento deseado, pero exige disciplina de datos).

## Siguiente paso propuesto

Pasar a Prompt 11 (dependencias y mantenimiento) manteniendo el gate de contratos en verde y dejando un mini plan para abordar la deuda de `typecheck` en PR dedicado.
