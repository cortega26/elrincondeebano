# 166 — WhatsApp "Avísame cuando vuelva" on out-of-stock cards

- **Source**: Auditoría 10, DIR-05 · **Status**: DONE · **Priority**: P3 · **Effort**: S
- **Stamped against**: `ee20b0f6` (2026-08-17) · **Drift check**: `git diff --stat ee20b0f6..HEAD -- astro-poc/src/scripts/storefront/storefront-state.ts astro-poc/src/scripts/storefront.js astro-poc/src/components/ProductCard.astro astro-poc/src/components/ProductGrid.astro astro-poc/src/scripts/storefront/catalog-view.js docs/operations/RUNBOOK.md`

## Problem

`stock: false` is a first-class catalog state the operator actively maintains ("Usa `stock: false` para productos sin disponibilidad temporal: el catálogo los marca como AGOTADO", `RUNBOOK.md:283-288`), the storefront hard-blocks adding those to cart (`storefront-state.ts:198` gates on `product.stock === false`), and the ONLY conversion path in the entire site is a single `wa.me` deep link (`storefront.js:994`). For a grocery shop, an out-of-stock product is the most common lost sale — and the operator's restock flow is manual ("conserva el registro para reactivarlo cuando vuelva disponibilidad", `RUNBOOK.md:289`).

A repo-wide search for notify/subscribe/newsletter surfaces nothing. This is the cheapest conversion win available: a prefilled WhatsApp message on AGOTADO cards reuses the operator's existing inbox as a self-managing waitlist — zero backend, zero PII.

## Scope

**In**: `astro-poc/src/components/ProductCard.astro` (render the notify link on the out-of-stock state — find the AGOTADO markup first), `astro-poc/src/scripts/storefront.js` (the `wa.me` helper + any click analytics via the ADR 0010 emitter pattern), `astro-poc/src/scripts/storefront/catalog-view.js` only if the card state renders there (verify where AGOTADO is rendered before deciding), e2e (`test/e2e-astro/` — a `parity-smoke` or cart spec asserting the link appears on an out-of-stock product).

**Out**: The cart/order path, `storefront-state.ts` stock gating, the admin.

## Steps

1. Find where the AGOTADO state renders (ProductCard.astro or catalog-view.js) and add a link/button: `https://wa.me/<WHATSAPP_NUMBER>?text=<encoded "Avísame cuando vuelva a estar disponible <name> (<sku>)">` — reusing the same `WHATSAPP_NUMBER` and URL-encode pattern as `storefront.js:994`. Respect the ADR 0010 privacy matrix: the message carries the product name + sku only (no cart composition, no PII).
2. Wire the click through the existing analytics emitter (`trackAnalyticsEvent` per ADR 0010) so the operator can see the clicks in the same funnel instrumentation that exists today.
3. Ensure the link is `rel="noopener"` and keyboard-focusable (a real anchor, not a div) — the a11y posture of the repo demands it.

## Tests

- e2e: on a fixture with a `stock:false` product (fixtures exist in `admin/content-manager/test/fixtures/`), assert the card renders the notify link with the correct `wa.me` href and encoded text. Model after `test/e2e-astro/` specs (storefront fixtures ship via the build).
- Run: `npm run build:fast` + the touched e2e spec (`npm run test:e2e` with `PLAYWRIGHT_SKIP_BUILD=1` against a fresh dist); `npm run lint` green.

## Done criteria

- [ ] Out-of-stock cards render a working `wa.me` notify link (asserted).
- [ ] The message contains product name + sku only (asserted).
- [ ] Click fires the ADR 0010 analytics emitter (asserted or by construction).

## Maintenance

This intentionally sends inbound messages to the operator's WhatsApp — that is the feature, and at this shop's volume it's manageable. If the waitlist grows, the admin's sync/queue machinery is the natural next home (a follow-up decision; out of scope here). The RUNBOOK's manual-restock note could gain one line pointing at the notify flow once it ships.

## Rollback

`git revert <sha>`.

## STOP conditions

- If the AGOTADO state renders in a place that has no access to `WHATSAPP_NUMBER`/the message-builder helper, stop and report — the wiring path must be decided explicitly.
