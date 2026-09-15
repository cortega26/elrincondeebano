# Plan 216 — todo

- [x] spec.md + diagnóstico (fonts nunca cargan: `document.fonts` vacío)
- [ ] T1: fetch Archivo 400/500/700/800 → assets/fonts + link en BaseLayout
- [ ] T2: tokens + purga Inter/Playfair + stacks Archivo
- [ ] T3: navbar plano + marca
- [ ] T4: hero sin tarjeta + headers editoriales
- [ ] T5: tiles precio-primero + badge + media
- [ ] T6: botones/radio/SVG + consistencia detalle/dialogs
- [x] T7: gates + cierre (README + archive + commit)

## Baseline (pre-216, post-215)

- LH móvil: 71 / 100 / 100 / 100 · desktop a11y/BP/SEO 100
- `document.fonts.size === 0` en producción (ninguna webfont cargada)

## After (gates) — 2026-09-15

- 5× Archivo cargadas (`document.fonts`: 400/500/600/700/800 loaded)
- LH móvil: 71 / 100 / 100 / 100 (LCP 5.6s, TBT 0, CLS 0.009)
- LH desktop: a11y/BP/SEO 100
- `lint` 0 errors · `typecheck` verde · `check:e2e-selectors` verde
- `guardrails:assets` verde (huérfano preexistente `logo.avif`) · `lint:images` verde
- `npm test`: root 392/392 · admin 741/741 · e2e 47 passed + 2 skip
- Geometrías: navbar 64px una fila · entry 357px (<400) · catálogo verificado
- T12 re-pinned a PAN p-e7bec89f0c9c ($2.400/$4.800) por edición del operador
  (Pepita stock:false, rev 16 — respetada, no revertida)

## Desvíos / hallazgos

1. `fetch-fonts.mjs` usa el CSS local como entrada: hubo que pasar el CSS remoto
   vía `FONTS_CSS_PATH` + UA Chrome (si no, Google devuelve TTF, no woff2).
2. Mi `edit` inicial borró `--primary-color` del `:root` — detectado por relectura
   y reparado antes del build (lección: verificar ediciones al bloque).
3. Navbar móvil de 2 filas: el wrap era gratuito (`flex-wrap:wrap` heredado ganaba
   por especificidad 0,2,0 a mi 0,1,0) → fix con `.navbar > .storefront-navbar__inner`.
4. Marca truncada a 390px con Archivo 800 → marca corta "Ébano" ≤575px
   (display:none, sin duplicar anuncio a SR).
