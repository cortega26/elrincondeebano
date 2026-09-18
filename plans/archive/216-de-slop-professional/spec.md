# Plan 216 — De-slop: tipografía real y sistema visual profesional

**Status:** IN PROGRESS · **Priority:** P1 · **Effort:** M · **Depends on:** 215 (cerrado)
**Dirección (decisión del ejecutor):** retail editorial de barrio — una sola familia
grotesca (Archivo), sin serifas, radio menor, superficies planas, jerarquía precio-primero.

## 1. Diagnóstico (evidencia, no gusto)

La auditoría visual del 2026-09-15 encontró la causa raíz del aspecto "AI-slop":

1. **Las webfonts nunca cargan.** `assets/fonts/` y `public/assets/fonts/` existen y se
   sincronizan, pero ningún HTML referencia `fonts.css` (`document.fonts` vacío en
   producción). El sitio renderiza cuerpo en system-ui y titulares en Georgia (fallback
   de Playfair) — literalmente la plantilla por defecto.
2. **Inter + Playfair es la pareja genérica AI**, y ni siquiera llega al usuario.
3. **Sopa de tarjetas**: hero, chips, secciones y productos son la misma tarjeta
   beige redondeada; todo pill (botones, chips, badges); headers de sección sin sistema
   (h2 + párrafo gris); navbar con gradiente + serif que no combina con nada.
4. Detalles: glifo `↻` como texto (botón Repetir), badges y sombras genéricos Bootstrap.

## 2. Sistema propuesto

- **Tipo:** Archivo (Google Fonts, self-hosted woff2 latin 400/500/700/800).
  Display 800 tight (`-0.02em`) para h1/marca/precios grandes; cuerpo 400/500;
  semibold 600–700 para CTAs y etiquetas. Cero serifas en toda la UI.
  Tabular-nums ya existe para precios; se conserva.
- **Forma:** radio 8px tarjetas/botones (pills solo en chips de navegación, que es
  patrón nativo), bordes hairline, sombras casi planas, superficies blancas con
  crema solo en hero/carrito.
- **Hero:** sin tarjeta — banda plana con eyebrow kicker, headline, lead y CTAs;
  conserva presupuesto de altura móvil (<400px, spec visual vigente).
- **Secciones:** header editorial (kicker + título + regla), descripciones recortadas.
- **Navbar:** verde plano profundo, marca en Archivo 800, regla dorada hairline.
- **Tiles de producto:** precio primero (más grande, tabular), nombre Archivo 600,
  media sobre blanco puro con hairline, badge oferta como etiqueta compacta.
- **Glifos:** `↻` → SVG inline; separadores `·` del shortcut se conservan (texto JS).

## 3. No-negociables

- Mismos contratos que plan 215: selectores e2e intactos, geometrías e2e
  (entry <400px, catálogos ≤ pantallas, jerarquía carrito), CLS = 0, a11y LH 100.
- Métricas de fuente: latin-only, 4 ficheros; `font-display: swap` (400/500) y
  `optional` (700/800) como hoy; sin preload en primera iteración (medir LH antes).
- `guardrails:assets` + `lint:images` deben pasar (cambian assets/fonts).
- El fetch de fuentes requiere red + `ALLOW_REMOTE_FONTS=1` (solo paso de descarga;
  el build no necesita red).

## 4. Cortes

- T1 — Fuentes: `tools/fetch-fonts.mjs` (targets + URL) → `assets/fonts/` →
  `fonts.css` reescrito → `<link>` en `BaseLayout` → stacks en `global.css`.
- T2 — Tokens tipo/forma/color en `:root` + purga de citas Playfair/Inter.
- T3 — Navbar plano + marca Archivo.
- T4 — Hero sin tarjeta + headers editoriales de sección.
- T5 — Tiles/strip: jerarquía precio-primero, badge refinado, media blanca.
- T6 — Botones 8px + detalle/dialogs/estacionamiento consistentes + SVG repeat.
- T7 — Gates + cierre.

## 5. STOP

- `guardrails:assets` o `lint:images` en rojo → detener, reparar antes de seguir.
- Geometría e2e rota por métricas de fuente → ajustar CSS (no tocar tests).
- LH a11y <100 o CLS >0 atribuible al plan → detener, reparar.

## 6. Verificación

`lint` → `typecheck` → `check:e2e-selectors` → `guardrails:assets` → `build:fast`
→ `npm test` → e2e (`PLAYWRIGHT_SKIP_BUILD=1`) → `lighthouse:audit` móvil+desktop.
Cierre: fila en `plans/README.md` + `git mv` a `plans/archive/` mismo commit.
Rollback: `git revert <sha>`.
