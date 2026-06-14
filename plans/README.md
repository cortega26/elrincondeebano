# Implementation Plans

Generados por `/improve deep` el 2026-06-14 sobre el commit `4751633`.
Ejecutar en el orden indicado respetando las dependencias.
Cada executor debe leer el plan completo antes de empezar, respetar sus STOP conditions, y actualizar su fila al terminar.

## Execution order & status

| Plan | Title                                                                             | Priority | Effort | Depends on                      | Status |
| ---- | --------------------------------------------------------------------------------- | -------- | ------ | ------------------------------- | ------ |
| 001  | Corregir bugs del carrito — dual keys, quota errors, stock en bundles, descuentos | P1       | M      | —                               | TODO   |
| 002  | Corregir race condition en parking reservation + añadir tests                     | P1       | M      | —                               | TODO   |
| 003  | Eliminar innerHTML y exposición de CSP nonce                                      | P1       | S      | — (001 si hay conflictos)       | TODO   |
| 004  | Cachear funciones de build-time en catalog.ts + dividir JSON storefront           | P2       | S      | —                               | TODO   |
| 005  | Optimizar renderizado DOM y payload en cliente                                    | P2       | M      | 001                             | TODO   |
| 006  | Extender cache TTLs del service worker + CSS externo                              | P2       | S      | —                               | TODO   |
| 007  | Consolidar duplicación, unificar convenciones y limpiar código spike              | P2       | M      | 001, 004                        | TODO   |
| 008  | Arreglar tooling de desarrollo — npm run dev, lint-staged TS, .editorconfig       | P2       | S      | —                               | TODO   |
| 009  | Migrar funcionalidades del logger legacy al logger activo                         | P2       | S      | —                               | TODO   |
| 010  | Añadir tests unitarios para catalog.ts, seo.ts, product-identity.ts               | P2       | M      | 007 (formatPrice), 009 (logger) | TODO   |
| 011  | Higiene de dependencias — stale node_modules, documentar fork anymatch            | P3       | S      | —                               | TODO   |
| 012  | Unificar políticas CSP — header vs meta tag + hashes Cloudflare                   | P2       | M      | 003                             | TODO   |

Status values: TODO | IN PROGRESS | DONE | BLOCKED (con razón de una línea) | REJECTED (con razón de una línea)

## Dependency notes

- **001 → 005**: Plan 005 modifica `storefront.js` (renderCart, getSourceProductCards). Ejecutar 001 primero para evitar conflictos.
- **001 → 007**: Plan 007 toca `catalog.ts` (formatPrice) y `storefront.js` (spike code). 001 modifica las mismas zonas.
- **004 → 007**: Plan 004 añade caches en `catalog.ts`. Plan 007 consolida `formatPrice` en el mismo archivo. Ejecutar en orden.
- **003 → 012**: Plan 003 elimina `window.__CSP_NONCE__`. Plan 012 puede eliminar `csp.js` completo. Sin 003, 012 podría dejar el nonce expuesto.
- **007 → 010**: Plan 010 testea `catalog.ts`. Si 007 elimina `formatPrice`, los tests de 010 deben reflejar el nuevo API.
- **009 → 010**: Plan 010 incluye tests para `logger.ts`. Si 009 cambia el logger, los tests deben cubrir las nuevas funciones.

## Ejecución paralela segura

Estos grupos pueden ejecutarse en paralelo (no dependen entre sí):

- **Grupo A** (independientes): 002, 003, 004, 006, 008, 009, 011
- **Grupo B** (después de A): 001, 007, 012
- **Grupo C** (después de B): 005, 010

O en formato de pipeline:

```
Fase 1 (paralelo): 002, 003, 004, 006, 008, 009, 011
Fase 2 (paralelo): 001, 007, 012
Fase 3 (paralelo): 005, 010
```

## Findings considered and rejected

Estos hallazgos de la auditoría fueron considerados pero NO tienen plan:

- **CB-03** (image pipeline version string compounds): bajo impacto, solo afecta debugging. El string version crece pero funciona correctamente.
- **CB-06** (loadCartFromUrl discards silently): la UX es deliberada — preservar el carrito existente. Mejorable pero no es un bug.
- **CB-08** (canUseStorage probe key leak): extremadamente raro, impacto trivial.
- **CB-09** (isOrderJustSent persiste 24h con reloj local): mitigado — `setQty` limpia el flag al añadir items.
- **CB-10** (hydrateCartFromOrder sin error log): el caller ya tiene guardas. Añadir log es defensivo pero no urgente.
- **CB-11** (SW message handler sin cleanup en missing port): el caller usa timeout de 5s.
- **SEC-05** (cart URL hash leak): feature prototype, no expone PII. Advertencia en UI sería suficiente.
- **PERF-06** (Bootstrap JS completo): M effort. Astro/Vite tree-shakes imports de `bootstrap/js/dist/*`. No se verificó si tree-shaking ya lo resuelve.
- **PERF-10** (bundles serializan JSON en data attributes): S pero acoplado a refactor de bundles. Dependería de plan 007.
- **PERF-11** (layout thrashing en catalog-view): incluido en plan 005 (DocumentFragment).
- **PERF-12** (image pipelines consolidation): L effort, alto blast radius. Necesita spike de investigación primero.
- **PERF-13** (font loading): MED confidence — necesita verificación de runtime antes de actuar.
- **TDA-01** (extract storefront.js sub-modules): L effort, depende de TC-1 (characterization tests). Demasiado grande para un plan ejecutable ahora.
- **TDA-06** (two-logger duplication): cubierto por plan 009.
- **TDA-08** (17k archive files): S pero el guardrail ya monitorea. Bajo impacto en DX diaria.
- **TC-1** (storefront.js zero tests): L effort, HIGH risk. Necesita characterization tests + DI refactor primero. Demasiado para un plan.
- **TC-3** (8 Astro components sin tests): M por componente, 8 componentes. Costoso. Plan futuro cuando haya herramienta de test para Astro components.
- **TC-7** (18 CLI tools sin tests): S-M por tool. Prioridad baja — las tools fallan ruidosamente (exit code ≠ 0).
- **TC-8** (5 Python admin modules sin tests): Python, fuera del scope principal.
- **TC-9** (legacy test bias): problema de estrategia de migración, no de implementación.
- **TC-10** (thin E2E coverage): L effort. Cada test E2E tiene costo de mantenimiento alto.
- **TC-11** (coverage thresholds bajos): es un marcador de estado, no un fix.
- **TC-12** (heavy mocking en legacy tests): legacy code en migración. No vale la pena refactorear.
- **TC-13** (no integration tests): M effort, requiere decisión arquitectónica sobre qué capa integrar.
- **DM-03** (no workspaces): es por diseño, documentado en BOOTSTRAP.md.
- **DM-05** (ES2018 target): menor. Node 24 soporta ES2022+. No hay impacto en bundle size (SSG).
- **DM-06** (Python lockfile behind): cambios triviales de versión, sin CVEs.
- **DX-3** (lint-staged bypasses astro-poc): ya incluido implícitamente en DX-2 (se añade ESLint a TS files).
- **DX-4** (sequential test runner hardcoded): M effort. Migrar 70+ test files de node:test a Vitest es no trivial.
- **DX-5** (active logger lacks sanitization): cubierto por plan 009.
- **DIR-01,02,03,04,05** (direction findings): son sugerencias de producto/estrategia, no bugs técnicos. Requieren decisión del maintainer.
