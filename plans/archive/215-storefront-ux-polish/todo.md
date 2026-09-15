# Plan 215 — todo (DONE 2026-09-15)

- [x] spec.md written + direction locked (balanced / warm store / chip bar / shoppable detail)
- [x] P0: baseline — `build:fast` green + Lighthouse before (mobile + desktop) recorded below
- [x] P1: tokens + touch targets ≥44px + AA contrast + reduced-motion extension
- [x] P2: `CategoryAnchorBar.astro` + compressed mobile hero + rhythm scale
- [x] P3: unified card language (grid + strip), aligned rows, `data-*` untouched
- [x] P4: controls mobile grid + empty-state "Limpiar filtros" (sin auto-foco: ver desvíos)
- [x] P5: shoppable `ProductDetail` + related strip + sticky mobile buy bar
- [x] P6: navbar hit areas + brand truncation + cart announce path (verificado sin cambios)
- [x] P7: cart drawer trigger + described-by + thumb-zone deconflict
- [x] P8: footer links + microcopy "al pedido" unificado
- [x] P9: motion tokens + fonts swap (skeleton N/A: SSG pinta el grid de inmediato)
- [x] Hallazgo: prune borraba icon-192/512 (manifest+SW) → fix + test en P-gates
- [x] Hallazgo: quirk axe fondo-blanco bajo el fold → fondo explícito + orden del pie
- [x] Gates: lint, typecheck, check:e2e-selectors, build, test, e2e, lighthouse after
- [x] Close: `plans/README.md` row + `git mv` to `plans/archive/` (same commit)

## Baseline (P0) — 2026-09-15, `dist` from `build:fast` green, served via dev-server

- `build:fast`: GREEN (asset contract 582 paths, HTTP 7 files, artifacts 14 files)
- Lighthouse before mobile (home): 72 perf / 100 a11y / 96 BP / 100 SEO
  (LCP 5.5s simulated, TBT 0ms, CLS 0; top savings: unused-css 1040ms, unused-js 450ms)
- Lighthouse before desktop (home): 98 / 100 / 96 / 100
- Reports (gitignored): `reports/plan-215-baseline/`, `reports/plan-215-after/`
- STOP bar for close: a11y ≥ 100/100, CLS = 0, no new e2e-selector renames

## After (gates) — 2026-09-15

- Lighthouse after mobile: 71 / 100 / 100 / 100 (LCP 5.5s, TBT 0, CLS 0;
  perf −1 = ruido simulate; BP +4 por el fix del prune; +74KB = iconos PWA servidos)
- Lighthouse after desktop: a11y/BP/SEO 100 (perf 98 en baseline, cambio solo CSS)
- `lint`: 0 errors (warnings preexistentes); `typecheck` verde; `check:e2e-selectors` verde
- `npm test`: root 392/392 (389 + 3 del prune) · admin 741/741
- `test:e2e` (PLAYWRIGHT_SKIP_BUILD=1): 47 passed, 2 skipped (plan 166, preexistentes)

## Desvíos documentados

1. P4: sin auto-foco al vaciar resultados — `role=status` lo anuncia; mover el foco
   mientras se escribe es hostil. El botón delega en `#filter-clear` (mismo reset + foco).
2. P5 rama `stock === false`: inalcanzable hoy (`getProducts()` filtra stock:false y
   archivados → esas páginas ni se generan). Se conserva como guarda del patrón plan 166
   (sin `.add-to-cart-btn` cuando esté agotado).
3. P9 skeleton: innecesario — el grid es HTML estático, pinta sin espera JS.
4. Prune (`postbuild-prune-unreferenced-images.mjs`): solo escaneaba HTML + product_data
   y borraba `icon-192/512.png` en cada build (manifest + precache del SW → 404 real).
   Fix: `collectManifestAndWorkerReferencedAssets()` + main-guard exportable +
   `test/postbuild-prune-manifest.test.js` (3 tests). Preexistente, detectado por el gate LH.
5. Quirk axe/Lighthouse: a nodos bajo el fold les atribuye fondo `#ffffff` según su
   posición en el documento (falso "contraste 1.05"; contraste real 14:1 verificado en
   DOM vivo). Mitigación: `background-color: #212529` explícito en `.footer-content`
   (igual que `.bg-dark`, cero cambio visual) + enlaces del pie DESPUÉS del párrafo.
   Si se reordena el pie, revalidar a11y LH. Evidencia: nav-delante→97, nav-detrás→100,
   fondo-explícito→100 estable en móvil y desktop.
