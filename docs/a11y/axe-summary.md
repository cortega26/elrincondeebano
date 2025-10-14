# Accessibility Summary – 2025-10-13

## Scan Context
- Tooling: axe-core 4.10.3 via Lighthouse, manual keyboard walkthrough (Chrome 119, Firefox 130).
- Scope: `/`, `/pages/chocolates.html`, cart offcanvas, 404, checkout CTA panel.

## Violations
| ID | Severity | Location | Description | Notes |
| --- | --- | --- | --- | --- |
| nested-interactive | Serious | Product cards (`.card`) | Buttons nested inside anchor links violate WCAG 2.1 4.1.2 | Requires markup refactor (see backlog `A11Y-06`). |
| color-contrast | Serious | `.card-text.text-muted` | Contrast ratio 3.2:1 on white background | Adopt darker secondary text token (`#4a4f55`). |
| aria-dialog | Critical | Cart offcanvas | Missing `role="dialog"` and focus trap on open | Focus stays on underlying page; screen readers lose context. |

## Manual Findings
- **Focus Order:** Skip link works; nav toggles (now buttons) respect `aria-expanded`.
- **Keyboard Traps:** None found, but cart offcanvas allows focus leakage.
- **Forms:** Filter inputs have labels; price sort uses accessible `select`.

## Recommendations
1. Convert product card structure so the entire card is a button or make “Add to cart” the sole interactive element.
2. Update offcanvas markup to `role="dialog"`, send focus to heading, trap tab cycle, restore focus on close.
3. Update muted text styles to meet AA contrast.
