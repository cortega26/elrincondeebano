# Plan 093: Fundamentos de UX — navegación persistente, tokens de diseño, feedback unificado, a11y

> Auditoría 8 (2026-08-11). Finding 26 (UX-01, UX-03, UX-04, UX-05-parte, UX-08, UX-10, UX-11, UX-12).

## Status

- **Priority**: P1
- **Effort**: M-L
- **Risk**: MED — refactor visual de alto contacto; e2e smoke (aserta headings, no nav) es la red
- **Depends on**: 088 (paginación/bulk tocan la misma página), 091 (confirm deletes ya cubiertos allí)
- **Category**: UX/UI
- **Written against**: commit `cefdd9f`

## Why this matters

La app es "extremadamente plana y difícil de usar" por causas concretas:
sin navegación persistente (cada página tiene su propio subset de links y
ProductsPage no tiene ninguno), cero estilos base (botones en gris del UA, sin
jerarquía), tres patrones de feedback, errores que destruyen el formulario
abierto, dialogs sin focus trap, contraste bajo AA, densidad que no hace nada
y strings en inglés en la mitad del flujo de publicación.

## Current state

- `app/App.tsx:130-137` — Layout solo `<Outlet/>`; nav duplicada y parcial por página (`CategoriesPage.tsx:180-188`, `BundlesPage.tsx:221-230`, `ImportPage.tsx:175-185`, `HistoryPage.tsx:226-235`, `PublicationPage.tsx:147-159`, `SettingsPage.tsx:30-39`); labels divergentes (Medios/Vitrina vs h1s).
- `styles/global.css:1-80` — sin reglas para `button`/`input`/`select`/`table`; ~200 `style={}` inline; sin `:hover`/`:focus-visible`/`:disabled`.
- `ProductsPage.tsx:374-389` — error de página reemplaza TODO (el form y sus ediciones se pierden); mismo patrón en `CategoriesPage.tsx:155-170`, `ConflictsPage.tsx:192-207`.
- Feedback en 3 patrones: caja dismissible `role="status"` (ProductsPage:537-558), `<p role="status/alert">` sin dismiss (BundlesPage:237-241, MediaPage:237-241, HistoryPage:242-246, ImportPage:234-238, DiagnosticsPage:80-84); sin toasts.
- Dialogs: `CredentialPrompt.tsx:17-77` sin `role="dialog"`/`aria-modal`/trap/Escape; `ImportPage.tsx:321-346`, `HistoryPage.tsx:366-389` con role+autofocus pero sin trap ni Escape.
- Contraste: `#6c757d` sobre `#f8f9fa` ≈ 4.4:1 (`global.css:59-61`); placeholder `#999`/`#eee` ≈ 2.5:1 (`ProductsPage.tsx:1000-1006`); botones subcategoría ≈13px (`CategoriesPage.tsx:442-455`).
- `preferences.ts:64-70` setea `data-density` sin regla CSS (no-op); `PublicationPage.tsx:204-285,459-499` y `MediaPage.tsx:423` en inglés parcial.
- Sort headers sin keyboard/`aria-sort` (`ProductsPage.tsx:777-830`); filas `tabIndex=0` sin grid pattern (`:838-871`).

## Scope

**In scope**: `App.tsx`, `global.css` (tokens + estilos base + densidad + contraste), páginas (nav y feedback), dialogs (trap/Escape/aria), i18n es en PublicationPage/MediaPage, tests a11y reales.
**Out of scope**: refactor estructural de ProductsPage (094), toasts como sistema global (solo componente de feedback aquí), rediseño de layout (solo fundaciones).

## Steps

### Step 1: Design tokens + estilos base en global.css

- CSS custom properties: `--color-primary`, `--color-danger`, `--color-muted` (≥4.5:1 en ambos temas), `--radius`, `--space-*`, `--control-min-height: 24px`.
- Reglas base: `button`, `input`, `select`, `textarea` con borde/radius/focus-visible/disabled; clases `.btn`, `.btn--primary`, `.btn--danger`, `.btn--ghost`, `.table`, `.card`.
- Implementar `[data-density='compact']` (padding de celdas reducido).
- Alto contraste real: `[data-high-contrast]` sube muted colors, no solo border.

**Verificar**: screenshot/manual + test unitario de contraste (calcular ratio desde las variables, patrón de `test/contract/wcagAudit.test.ts` pero computando, no regex).

### Step 2: Navegación persistente

- `AppNav` en `Layout` con los 11 destinos, `aria-current="page"`, labels alineados con los h1s ("Vitrina", "Medios", "Cambios y recuperación", "Publicación", …).
- Borrar los bloques nav de las páginas; actualizar `App.tsx:83-91` (shortcuts `g`): agregar `b` bundles, `h` history, `u` publish.
- Ajustar e2e smoke si algún test navegaba vía links de página (hoy asertan h1s — verificar).

**Verificar**: e2e — desde `/products` se llega a las 11 rutas por nav; `g b`/`g h`/`g u` navegan; `aria-current` presente en la ruta activa.

### Step 3: Feedback unificado

- Componente `Feedback` (`src/web/app/components/Feedback.tsx`): variantes success/error/info, dismissible, `role="status"`/`role="alert"` según severidad, auto-dismiss solo success (5 s), persistente para errores.
- Migrar los 3 patrones a `Feedback` en las 11 páginas.
- Errors de operación NO reemplazan la página: `formError` dentro del form (valores intactos), `loadError` sobre la tabla con retry; la pantalla de error total solo para fallo de carga inicial (`ProductsPage.tsx:374-389` → refactor del estado de error).

**Verificar**: e2e — fallo de save inducido (409) mantiene el form con valores y muestra error inline; pantalla total solo en load inicial.

### Step 4: Dialogs accesibles

- Hook `useDialog` compartido: `role="dialog"` + `aria-modal` + focus trap + Escape + retorno de foco al opener.
- Aplicar a `CredentialPrompt`, dialogs de `ImportPage` y `HistoryPage`.
- Sort headers: `<th><button>` con `aria-sort` y Enter/Space.

**Verificar**: tests de keyboard reales (Playwright): tab al header, Enter ordena, `aria-sort` cambia; dialog: Tab cicla dentro, Escape cierra, foco vuelve.

### Step 5: i18n es + limpieza

- Traducir los strings en inglés de `PublicationPage.tsx` (Git pull (rebase), Dirty/Clean, Staged/Unstaged/Untracked, Commit message:, Push after commit, Preview, Commit, Commit + Push) y `MediaPage.tsx` (estados del inventario: active/orphan/missing/pending → activo/huérfano/faltante/pendiente) y `ConflictsPage.tsx` (badges).

**Verificar**: grep de "Commit"/"Staged" en strings de UI = 0 (excepto nombres propios como Git).

### Step 6: Suite

```bash
npm run admin:test && npm run admin:typecheck && npm run admin:certify && npx playwright test -c playwright.config.ts
```

## Test plan

- `test/browser/` — reemplazar los tests estáticos (keyboardA11y.test.ts, wcagAudit.test.ts) por tests reales: contraste computado desde las variables, navegación por teclado, focus trap. Mantener los estáticos solo como red durante la transición.
- E2E smoke: navegación persistente + feedback + dialog.

## Done criteria

- [ ] Tokens + estilos base visibles en todas las páginas; contraste AA en muted text; densidad funcional; alto contraste real.
- [ ] Nav persistente con 11 rutas, labels alineados, shortcuts completos.
- [ ] Un solo componente `Feedback` en uso; errores de operación no destruyen forms.
- [ ] Dialogs con trap/Escape/aria-modal; sort con `aria-sort` y keyboard.
- [ ] Sin strings en inglés en PublicationPage/MediaPage/ConflictsPage.
- [ ] Tests a11y comportamentales verdes.

## STOP conditions

- Si un test e2e existente depende del layout actual (p. ej. busca el nav de página), actualizar el spec en el mismo commit — no romper el contrato de headings sin revisar.

## Maintenance notes

Los tokens son el contrato visual: componentes nuevos usan las clases `.btn`/`.card`/`.table`, no inline styles. El hook `useDialog` es el único patrón de dialogs del repo a partir de este plan.
