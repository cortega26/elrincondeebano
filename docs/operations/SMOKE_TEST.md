# Manual Smoke Test (Prompt 1)

## Goal

Fast guided checks to detect regressions in critical user flows after changes.

## Preconditions

1. Build generated: `npm run build`
2. Local preview server running (example): `npx serve build -l 4173`
3. Base URL available (default): `http://127.0.0.1:4173`

## Guided Checklist

You can print this checklist in terminal with:

```bash
npm run smoke:manual
```

### 1) Homepage loads

- Open `/` and verify no blank screen or fatal errors.
- Confirm product grid renders initial items.
- Confirm navbar and footer render correctly.

### 2) Category navigation

- Open at least 3 category pages from the navbar.
- Confirm category title matches selected category.
- Confirm page does not flicker or freeze.

### 3) Search/filter

- Type an exact product keyword and confirm results narrow.
- Type a typo variant and confirm behavior remains stable.
- Clear filters and confirm full category/home list returns.

### 4) Product detail interaction

- Open one product card interaction path used by the site
  (quick actions / add to cart / card controls).
- Confirm name, price, and stock state render correctly.

### 5) Cart flow

- Add one available product to cart.
- Increase/decrease quantity.
- Remove item and confirm empty cart state recovers cleanly.

### 6) Checkout/contact flow

- Trigger checkout/contact CTA (for this project, WhatsApp flow if present).
- Confirm URL/protocol is valid (`https://`) and payload is well formed.
- Confirm failure fallback does not break UI if popup is blocked.

## Evidence Template (paste in PR)

```text
Smoke date:
Base URL:
Commit:

[ ] Homepage
[ ] Category navigation
[ ] Search/filter
[ ] Product detail interaction
[ ] Cart flow
[ ] Checkout/contact

Notes:
```

