# Implementation Plans — El Rincón de Ébano

Generados por `/improve deep` el 2026-06-11 (commit `501a0bd`).
Ejecuta en el orden indicado a continuación, respetando las dependencias.
Cada ejecutor: lee el plan completo antes de empezar y actualiza su fila al terminar.

## Orden de ejecución y estado

| Plan                                               | Título                                               | Prioridad | Esfuerzo | Depende de                             | Estado |
| -------------------------------------------------- | ---------------------------------------------------- | --------- | -------- | -------------------------------------- | ------ |
| [001](001-remove-cypress.md)                       | Eliminar Cypress y sus vulnerabilidades              | P1        | S        | —                                      | DONE   |
| [002](002-fix-double-record-order.md)              | Corregir doble `recordOrder()` en checkout           | P1        | S        | —                                      | DONE   |
| [003](003-csp-secret-scan-hardening.md)            | Hardening CSP + patrón Cloudflare en secret-scan     | P2        | S        | —                                      | DONE   |
| [004](004-fix-sw-cache-timeout-nav-groups.md)      | Fix SW cache timeout + nil-guard `nav_groups`        | P1        | S        | —                                      | DONE   |
| [005](005-dx-bundle-eslint-playwright-coverage.md) | DX bundle: ESLint TS + Playwright retries + coverage | P2        | S        | 001 (para no lintar cypress.config.ts) | DONE   |
| [006](006-extract-shared-formatting-constants.md)  | Extraer `formatCurrency` + `WHATSAPP_NUMBER` a lib   | P2        | S        | —                                      | DONE   |
| [007](007-storefront-state-unit-tests.md)          | Unit tests para `storefront-state.ts`                | P1        | M        | 002 (recomendado)                      | DONE   |
| [008](008-dir-shareable-cart-url.md)               | SPIKE: Carrito compartible por URL                   | P3        | S→M      | 006 (recomendado)                      | DONE   |
| [010](010-dir-stock-notifications.md)              | SPIKE: Notificaciones de productos favoritos         | P3        | S→L      | —                                      | DONE   |

**Valores de estado**: `TODO` | `IN PROGRESS` | `DONE` | `BLOCKED: <razón>` | `REJECTED: <razón>`

## Dependencias entre planes

- **005 después de 001**: el Plan 005 agrega TypeScript al glob de ESLint.
  Si Cypress aún está instalado, `cypress.config.ts` entrará en el lint —
  eliminarlo primero (001) simplifica el trabajo.
- **007 después de 002 (recomendado)**: los tests de `storefront-state.ts`
  deben incluir un test para verificar que `recordOrder` no se llama dos veces.
  Tener el fix del Plan 002 primero hace el test más claro.
- **008 después de 006 (recomendado)**: el carrito compartible usa `WHATSAPP_NUMBER`.
  Tener la constante centralizada facilita el spike.
- Planes 003, 004, 006 y 010 son totalmente independientes entre sí.

## Notas de ejecución

**Cómo ejecutar un plan en una nueva conversación**:

1. Abre una sesión de Claude Code en `/home/carlos/VS_Code_Projects/Tienda_Ebano`.
2. Lee el plan: `cat plans/NNN-slug.md`.
3. Ejecuta el drift check del encabezado del plan.
4. Sigue los pasos en orden; ejecuta cada verificación antes de avanzar.
5. Al terminar, actualiza este README cambiando `TODO` → `DONE`.

**Comandos de validación base** (deben pasar después de cualquier plan):

```bash
npm run lint        # exit 0, 0 warnings
npm run typecheck   # exit 0
npm test            # exit 0
npm run build       # exit 0
```

## Backlog: hallazgos válidos sin plan

Estos hallazgos fueron auditados, confirmados, pero no se priorizaron en esta
ronda. Deben re-evaluarse en la próxima auditoría (`/improve deep` post 001–007).
No volver a auditarlos desde cero — la evidencia está anotada aquí.

| Hallazgo                                          | Evidencia                                                                              | Esfuerzo | Por qué diferido                                                                                  |
| ------------------------------------------------- | -------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------- |
| DEPS-01: `@astrojs/check` con vulns MODERATE      | `astro-poc/package.json` — verificar versión con `npm audit`                           | S        | Requiere comprobar si hay versión parcheada de `@astrojs/check`; bajo impacto inmediato           |
| PERF-02: N+1 lecturas a localStorage en render    | `storefront.js` — `loadCart()` llamado por cada ítem renderizado en lugar de una vez   | S        | Bajo impacto medible hoy; abordar antes del Plan ARCH-01                                          |
| PERF-01/03: DOM queries sin caché                 | `storefront.js` — `document.querySelector` repetido en loops                           | S        | Micro-optimización; abordar junto con PERF-02                                                     |
| PERF-05: Sorting redundante en catalog-view       | `astro-poc/src/lib/catalog.ts` — re-ordena resultados ya ordenados en `getCatalogView` | S        | Bajo impacto en catálogos pequeños; auditar cuando crezca el catálogo                             |
| DEPS-03: `anymatch` vendorizado en el repo        | `src/` o `tools/` — buscar con `grep -r "anymatch"`                                    | S        | Investigar si es remanente del legacy `src/`; candidato a eliminación                             |
| ARCH-01: `storefront.js` god module (1790 líneas) | `astro-poc/src/scripts/storefront.js`                                                  | L        | Requiere cobertura de tests previa — completar Plan 007 primero; riesgo MED de regresión          |
| TEST-02: `catalog.ts` sin tests de funciones core | `astro-poc/src/lib/catalog.ts` — `getNavigationGroups`, `getCatalogView`, etc.         | L        | Diferido a favor de `storefront-state.ts` (Plan 007); segunda prioridad de tests                  |
| LEGACY-01: `src/js` en limbo                      | `src/js/` — módulos legacy no migrados; referenciados por algunos tests                | S        | Investigativo; antes de eliminar, auditar qué tests los usan y si hay equivalente en `astro-poc/` |
| DX-06: Mutation testing ausente de CI             | `vitest.config.mts` — no hay `@vitest/coverage-v8` con mutants                         | M        | Bajo impacto inmediato; considerar después de subir thresholds de cobertura (Plan 005+007)        |

## Hallazgos rechazados (no son problemas)

Los siguientes fueron auditados y descartados. No reabrir sin nueva evidencia.

| Hallazgo                                        | Razón del rechazo                                                                                                                                                     |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PERF-08: Datos inline en build de Astro         | Comportamiento normal de SSG — Astro computa datos en build time por diseño                                                                                           |
| CONC-01: Race condition en pendingOrderData     | Ventana de colisión sub-100ms en la práctica; riesgo muy bajo en contexto mono-usuario                                                                                |
| DX-01: Label de versión de action inconsistente | Cosmético — el SHA fijado es lo que importa en seguridad de CI, no la etiqueta                                                                                        |
| DX-05: Falta `.editorconfig`                    | Redundante con Prettier en pre-commit; no aporta valor adicional                                                                                                      |
| DEPS-5: TypeScript 6 es bleeding-edge           | Adopción deliberada; sin evidencia de problemas actuales en el proyecto                                                                                               |
| SEC-02: CSP `img-src: https:` wildcard          | Patrón común y aceptado para sites estáticos con CDN; riesgo bajo                                                                                                     |
| LAYER-01: Factory pattern con 12+ deps          | By design para testabilidad — no es un anti-patrón en este contexto                                                                                                   |
| DIR-03: Personalización no renderizada en home  | FALSO POSITIVO — `renderPersonalizedProducts()` SÍ se llama en init (`storefront.js:1749`) y el contenedor `[data-home-personalized-grid]` SÍ existe en `index.astro` |
| DIR-05: Falta botón "repetir último pedido"     | FALSO POSITIVO — `[data-repeat-last-order]` existe y está wired en `storefront.js:431–444` y `1459–1524`                                                              |
| DIR-09: Selector de horario de retiro/entrega   | RECHAZADO por decisión operativa — la mercancía se entrega a domicilio y de forma inmediata; no se deben prometer slots ni retiro programado                          |

## Próxima auditoría recomendada

Después de completar los planes 001–007:

- Ejecutar `/improve deep` de nuevo para medir progreso
- Subir los coverage thresholds (Plan 005) una vez que Plan 007 sume tests
- Convertir ARCH-01 en un plan de ejecución una vez que `storefront-state.ts`
  esté cubierto por tests
- Investigar DEPS-01 (`@astrojs/check` vulns) con `npm audit` actualizado
