# 167 — Resolve the storefront-observability dead end (ADR 0010 go/no-go)

- **Source**: Auditoría 10, DIR-06 · **Status**: TODO · **Priority**: P3 · **Effort**: M (spike/decision)
- **Stamped against**: `ee20b0f6` (2026-08-17) · **Drift check**: `git diff --stat ee20b0f6..HEAD -- astro-poc/src/scripts/storefront.js astro-poc/src/scripts/storefront/observability.js astro-poc/src/scripts/storefront/observability.ts astro-poc/src/lib/logger.ts docs/operations/OBSERVABILITY.md docs/adr/0010-private-funnel-measurement.md`

## Problem

The storefront collects triage-grade web-vitals data in production that reaches nobody. `observability.initObservability({ enabled: true, slowEndpointMs: 1200 })` runs on every production page load (`storefront.js:1087`), capturing LCP/INP/CLS, runtime errors, and slow endpoints — but the entire output is `log(...)` → browser console (`logger.ts:67-82`), and `OBSERVABILITY.md:70`'s instruction is to "revisar eventos en logs del navegador" with no collector existing. The funnel events are in the same state: 5 emitters live (`storefront.js:987,1046,1339,1349,1406`), `window.__analyticsTrack` is never installed.

ADR 0010 documents the decision as deferred with **default no-go** — while sketching the cheapest compliant option ("Endpoint agregado first-party (edge function o build-only)", `docs/adr/0010-private-funnel-measurement.md:69`). The design work and provider-neutral contract are done (ADR §4); what's missing is the owner's go/no-go decision. This plan forces that decision with evidence.

## Scope

**In**: A decision deliverable + whichever branch it triggers: (A) **go** — implement the ADR §4 aggregate first-party endpoint (a tiny same-origin beacon endpoint or build-only aggregation) + wire the existing emitters, OR (B) **no-go** — disable the default collection (`enabled: false` in `storefront.js:1087`) and stop emitting funnel events that nobody consumes, and close/annotate ADR 0010 accordingly.

**Out**: The existing `observability.js`/`logger.ts` local logging (keep), the ADR's mandated privacy tests if go (fields discarded before transmit, checkout never blocked — ADR §2 tests), any third-party analytics.

## Steps

1. **Decide (the spike part)**: assemble the evidence for the owner — what the collection captures today, the triage thresholds (`OBSERVABILITY.md:11-20`: LCP>2.5s, INP>200ms, CLS>0.1), who would act on the data (single operator), and the two costs: go = a small first-party endpoint + privacy tests; no-go = flip one boolean. The repo's own ADR says default no-go — the recommendation here is **no-go unless the operator wants the data**; collecting data nobody reads is worse than not collecting, because the thresholds create an expectation of action.
2. If **go**: implement the ADR §4 aggregate endpoint (same-origin, fields whitelist, no PII), wire `observability.js` to beacon to it, and write the ADR-mandated tests (fields discarded before transmit; checkout flow never blocked — assert in the storefront tests, plan 140's suite is the pattern).
3. If **no-go**: set `enabled: false` in `storefront.js:1087`, disable/remove the 5 dead funnel emitters' payload building (keep the emitter API if ADR 0010 might be revisited — flag with a comment), and add a short ADR 0010 addendum recording the decision + date.

## Tests

- no-go: `npm run build:fast` green, root vitest green (observability tests, if any, updated to the disabled default); e2e untouched.
- go: the privacy tests per ADR §2 + the endpoint test (model after `test/share-preview-*` monitor patterns for the beacon).
- `npm run lint` + `npm run typecheck` green either way.

## Done criteria

- [ ] ADR 0010 records a dated decision (go or no-go).
- [ ] Either the collection is disabled by default (no-go) or the §4 endpoint + privacy tests exist (go).
- [ ] No production page silently ships enabled collection with no consumer (both branches guarantee this).

## Maintenance

This closes the last "collects-but-delivers-nowhere" loop in the storefront. If go, the endpoint is the seed of the operator's analytics; if no-go, the `enabled:false` flip is the documented way to re-enable if a collector ever exists. A reviewer should confirm no e2e spec asserted the enabled-default behavior.

## Rollback

`git revert <sha>` (trivial either branch).

## STOP conditions

- If the operator has an existing collector/endpoint outside the repo (this spike cannot know), stop and report — the ADR §4 design may not be the right one for it.
