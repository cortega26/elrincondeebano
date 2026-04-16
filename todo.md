# Cart UX Redesign — Todo

## Status Legend
- `[ ]` Not started
- `[>]` In progress
- `[x]` Done
- `[!]` Blocked

---

## Setup
- [x] Write spec.md
- [x] Create todo.md (this file)
- [x] Create `test/e2e-astro/cart-ux.spec.ts` with tests T1–T8

---

## Implementation

### Step 1 — HTML restructure (`Navbar.astro`)
- [x] Wrap `#cart-items` + `.cart-footer` in `.offcanvas-scroll-area`
- [x] Move `#submit-feedback` and `.cart-footer-actions` out of scroll area, as direct children of `.offcanvas-body`
- [x] Fix div nesting (missing closing tags for `.collapse` and `.cart-footer`)

### Step 2 — CSS single scroll (`global.css`)
- [x] `.offcanvas-body`: `display: flex; flex-direction: column; overflow-y: hidden; height: 0; min-height: 0`
- [x] `.offcanvas-scroll-area`: `flex: 1 1 0; min-height: 0; overflow-y: auto`
- [x] `.cart-footer-actions`: `flex: 0 0 auto` — pinned to bottom as flex sibling
- [x] Remove `max-height` caps from `.cart-footer` and `@media` overrides

### Step 3 — SVG remove button (`storefront.js`)
- [x] Replace `'Eliminar'` text with SVG trash icon + `<span>Quitar</span>`
- [x] Changed class from `btn btn-sm btn-outline-danger remove-item cart-item__remove` to `remove-item cart-item__remove`
- [x] CSS: pill shape (`border-radius: 999px; width: auto; height: 32px`)

### Step 4 — Tests
- [x] T1: Single scroll zone (scroll-area `overflow-y: auto`, body not scrolling)
- [x] T2: CTA pinned at bottom on 390×844 with 3 items (`actionsBottom ≈ bodyBottom ± 4px`)
- [x] T3: SVG in remove button, no raw text, ≥44×28 touch target
- [x] T4: Item DOM order: thumb before content
- [x] T5: Payment visible without scroll on 390×844 with 1 item
- [x] T6: State consistent after add/remove
- [x] T7: All interactive elements ≥44px wide (remove ≥44×28)
- [x] T8: No horizontal overflow at 320×568

---

## Verification Loop
- [x] Run `test/e2e-astro/cart-ux.spec.ts` — 8/8 green
- [x] Run `node --test test/cart.render.test.js test/cart.unit.test.mjs test/checkout.test.js` — 18/18 green
- [x] Run `npm run lint && npm run typecheck` — clean
- [x] Run `npm run build` — clean
- [ ] Run Codacy CLI on modified files

---

## Done
- spec.md created
- todo.md created
- test/e2e-astro/cart-ux.spec.ts: 8 tests all green
- Navbar.astro: correct flex structure with single scroll zone
- global.css: single-scroll layout with pinned CTA footer
- storefront.js: SVG trash icon remove button (pill shape)
