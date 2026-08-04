# Plan 038: Define a privacy-preserving storefront funnel measurement contract

> **Executor instructions**: This is a design/spike plan. Do not connect a provider, transmit events, add cookies or collect PII. Update `plans/README.md` when the decision is complete.
>
> **Drift check (run first)**: `git diff --stat 877f179..HEAD -- astro-poc/src/scripts/storefront.js astro-poc/src/layouts/BaseLayout.astro src/js/main.js docs/operations/OBSERVABILITY.md docs/adr`

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: `plans/037-converge-runtime-documentation.md`
- **Category**: direction
- **Planned at**: commit `877f179`, 2026-07-14

## Why this matters

The active runtime already emits cart, CTA, merchandising and WhatsApp-checkout events through `window.__analyticsTrack`, but no shipped initializer consumes them. A small design spike can determine whether useful aggregate conversion measurement is possible without order contents or resident PII. Implementation is explicitly deferred until privacy, consent and metric semantics are approved.

## Current state

- `storefront.js:37-44` makes analytics a no-op when `window.__analyticsTrack` is absent.
- Events exist around checkout (`1334-1350`), merchandising (`1511-1515`) and mobile cart/hero CTA (`1754-1769`).
- `BaseLayout.astro:106-111` loads cookie-free Plausible, but no event bridge is present.
- The only older initializer found is in unshipped `src/js/main.js`.

## Commands you will need

| Purpose | Command                                                                                    | Expected                 |
| ------- | ------------------------------------------------------------------------------------------ | ------------------------ |
| Search  | `rg -n -e '__analyticsTrack' -e 'trackAnalyticsEvent' -e 'plausible' astro-poc/src src/js` | event inventory produced |
| Docs    | `npx markdownlint-cli2 'docs/**/*.md' '*.md'`                                              | exit 0                   |

## Scope

**In scope**: create an ADR or design note under `docs/adr/` plus event/privacy matrix; update ADR index.

**Out of scope**: production JS changes, provider setup, network transmission, cookies/local identifiers, dashboards, collecting user/product/order text.

## Git workflow

- Branch: `advisor/038-private-funnel-spike`
- Commit: `docs(adr): define private funnel measurement contract`

## Steps

### Step 1: Inventory events and decisions

List every active event, trigger, current properties and the product decision it could inform. Reject events that cannot drive a stated decision.

**Verify**: inventory accounts for every active `trackAnalyticsEvent` call and excludes legacy-only emitters.

### Step 2: Define privacy and metric constraints

Prohibit names, apartment/department, notes, plate, WhatsApp message, cart/product IDs, exact order composition, persistent user IDs and raw URLs with user data. Define aggregate events, allowed coarse properties, retention, consent/legal owner, sampling and deletion policy. Specify protection against duplicate sends and blocked scripts.

**Verify**: privacy matrix marks every proposed property allowed/rejected with rationale.

### Step 3: Compare options and decide go/no-go

Compare no measurement, Plausible custom events and a first-party aggregate endpoint on privacy, operations, cost and reliability. Recommend no-go if the expected decision value does not justify consent/operations.

**Verify**: ADR records decision, trade-offs, success metrics and an implementation plan outline only if approved.

## Test plan

No runtime tests in this spike. Validate source inventory and markdown. Any later implementation must add unit tests proving forbidden fields are stripped and E2E proving checkout still works when analytics is blocked.

## Done criteria

- [ ] Every current active event is inventoried.
- [ ] Forbidden data and retention/consent ownership are explicit.
- [ ] ADR records go/no-go and provider-neutral event contract.
- [ ] No production/runtime/dependency change occurred.

## STOP conditions

- Business owner cannot state which decisions the data will change.
- Legal/privacy ownership is unavailable.
- Any useful proposal requires resident/order-level PII.

## Maintenance notes

Absence of analytics must never block checkout. Treat new properties as privacy-sensitive schema changes requiring review.
