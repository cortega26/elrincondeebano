# Cart UX Redesign — Spec v1.0

## Problem Statement

The checkout cart offcanvas has three compounding UX problems on mobile:

1. **Dual-scroll zones** — `#cart-items` scrolls independently, and `.cart-footer` also has a
   capped `max-height` with implicit scroll. Users encounter two separate scroll areas inside a
   single panel, which is disorienting and non-standard on touch devices.

2. **Remove button overflow** — The remove button is rendered as a 44 × 44 px circle but its text
   content ("✕" or "Eliminar") was set with no explicit `font-size` / `line-height` constraint,
   causing it to overflow or display incorrectly. An icon-only button needs a proper SVG glyph,
   not a unicode character.

3. **Layout quality** — Visual hierarchy in each cart item is unclear, touch targets for quantity
   buttons are borderline (44 px, should be 48 px on mobile), and the payment section competes for
   vertical space with the item list on small viewports.

---

## Goals

| #   | Goal                                                                                                                                                     |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1  | **Single scroll zone** — the offcanvas body scrolls as one continuous region. No nested scroll.                                                          |
| G2  | **Sticky CTA** — Submit + Continue Shopping buttons are always visible at the bottom of the panel without scrolling.                                     |
| G3  | **SVG trash icon** — The remove button renders a proper inline SVG trash icon at exactly 20 × 20 px, inside a 44 × 44 px touch target. No text overflow. |
| G4  | **Item clarity** — Each cart item has a clear visual hierarchy: thumbnail → product name → price line → quantity controls + remove.                      |
| G5  | **Payment visible by default** — On a 390 × 844 viewport with one item in cart, payment options are fully visible without scrolling.                     |
| G6  | **All existing tests stay green** — unit, render, checkout, and e2e specs.                                                                               |
| G7  | **Accessible** — No WCAG regressions. All interactive elements ≥ 44 × 44 px. aria-labels on all icon-only buttons.                                       |

## Non-Goals

- Migrating the cart to a reactive framework
- Changing the WhatsApp phone number
- Redesigning the product catalogue or navbar
- Changing the Astro page structure (adding new pages)

---

## Design Decisions

### DD1 — Single Scroll via `.offcanvas-body`

Remove `overflow-y: hidden` from `.offcanvas-body` and replace with `overflow-y: auto`.  
Remove `overflow-y: auto` and `max-height` caps from `#cart-items` and `.cart-footer`.  
Both `#cart-items` and `.cart-footer` become natural-flow children of the scrollable body.

```
[offcanvas (position: fixed, full-height)]
  [offcanvas-header  ← fixed height, not scrolled]
  [offcanvas-body  ← overflow-y: auto, flex-col, flex: 1 1 0, min-height: 0]
    [#cart-items     ← flex: none, natural height]
    [.cart-footer    ← flex: none, natural height]
      [.cart-footer-primary  (summary + payment)]
      [.cart-note-toggle-row]
      [.collapse#cart-details-collapse]
    [.cart-footer-actions  ← position: sticky, bottom: 0, z-index: 10]
      [#submit-cart]
      [#continue-shopping]
```

`.cart-footer-actions` is moved **outside** `.cart-footer` to be a direct child of `.offcanvas-body`.  
`position: sticky; bottom: 0` in a flex-column `overflow-y: auto` container makes it stick to the
bottom of the visible scrollport — exactly what we want.

### DD2 — SVG Trash Icon in `cart.mjs`

Replace the `'✕'` unicode text node with an inline SVG string passed via `innerHTML` on the button.  
The SVG is a 20 × 20 viewBox Material Design trash icon, `aria-hidden="true"`.  
The button keeps `aria-label` for screen readers.

### DD3 — Remove Button as Row Element

`.cart-item__remove` becomes a rectangular pill button (not a circle), aligned to the bottom-right
of the content column. Width: `auto`, `padding: 0.2rem 0.65rem`, `height: 32px`.  
This is more legible and avoids the circle-overflow problem entirely.  
It sits in `.cart-item__actions` next to the qty row, right-justified.

### DD4 — Quantity button size: 44 × 44 px (unchanged from Phase 1)

Kept at 44 × 44 px per WCAG 2.5.5 (minimum). No regression.

### DD5 — `.cart-footer-actions` HTML restructure

Currently `.cart-footer-actions` is **inside** `.cart-footer`. It must move to be a **sibling** of
`.cart-footer`, placed after it, as a direct child of `.offcanvas-body`.

---

## Implementation Plan

### Step 1 — HTML (`Navbar.astro`)

Move `.cart-footer-actions` and `#submit-feedback` out of `.cart-footer`, place them as the last
two direct children of `.offcanvas-body` (after `.cart-footer`).

### Step 2 — CSS (`global.css`)

```
.offcanvas-body:
  overflow-y: auto  (was: overflow-y: hidden)
  flex: 1 1 0
  min-height: 0
  remove: padding-bottom (the sticky footer handles safe-area)

#cart-items:
  flex: none  (was: flex: 1 1 0)
  overflow-y: visible  (was: overflow-y: auto)
  min-height: auto  (remove min-height: 0)
  remove: clamp min-height overrides in mobile

.cart-footer:
  flex: none
  overflow-y: visible  (remove overflow-y: auto and max-height caps)
  remove all max-height in @media queries

.cart-footer-actions:
  position: sticky
  bottom: 0
  z-index: 10  (bump from 1 — must cover scrolling content)
  padding-bottom: max(env(safe-area-inset-bottom, 0px), 0.85rem)
  background: solid (not gradient) to reliably mask scroll content
```

### Step 3 — JS (`cart.mjs`)

Replace `'✕'` text in remove button with an inline SVG trash icon.  
Change button size/shape to pill via class update in JS (no separate CSS class needed —
`.cart-item__remove` handles it).

### Step 4 — Tests (`test/cart-ux/cart-ux.spec.ts`)

Playwright tests validating all goals (see Verification section).

---

## Verification

Each goal has a test ID and what proves it.

| Goal | Test | How Verified                                                                                                                            |
| ---- | ---- | --------------------------------------------------------------------------------------------------------------------------------------- |
| G1   | `T1` | In-browser eval: `#cart-items` and `.cart-footer` have `overflow` ≠ `auto`/`scroll`. Only `.offcanvas-body` has `overflow-y: auto`.     |
| G2   | `T2` | `.cart-footer-actions` bottom edge equals offcanvas body bottom edge (within 2 px) on 390 × 844 with 3 items.                           |
| G3   | `T3` | `.cart-item__remove svg` exists; button bounding box ≥ 44 × 44 px; `innerText` of button does not include "Eliminar" or "✕".            |
| G4   | `T4` | Within a `.cart-item`, thumb appears before content column in DOM order; name text visible; price line visible.                         |
| G5   | `T5` | On 390 × 844 with 1 item, `#payment-method-container` bounding rect is fully within the offcanvas body visible rect (no scroll needed). |
| G6   | `T6` | `npm test` and `node --test test/cart.render.test.js test/cart.unit.test.mjs test/checkout.test.js` all pass.                           |
| G7   | `T7` | All `.quantity-btn` and `.cart-item__remove` bounding rects ≥ 44 × 44 px. No `aria-hidden="true"` on visible interactive elements.      |

---

## Files Modified

| File                                    | Change                                                                  |
| --------------------------------------- | ----------------------------------------------------------------------- |
| `astro-poc/src/components/Navbar.astro` | Move `.cart-footer-actions` + `#submit-feedback` outside `.cart-footer` |
| `astro-poc/src/styles/global.css`       | Single scroll layout, remove dual-scroll CSS                            |
| `src/js/modules/cart.mjs`               | SVG trash icon in remove button                                         |
| `test/cart-ux/cart-ux.spec.ts`          | New e2e tests T1–T7                                                     |
| `spec.md`                               | This document                                                           |
| `todo.md`                               | Task tracking                                                           |
