# ADR 0008: Enforced edge security contract for live production

- Date: 2026-07-15
- Status: Accepted

## Context

GitHub Pages is the content origin behind a Cloudflare edge (ADR 0004). The
security headers and the "clean" public-HTML surface that the edge is supposed to
present are versioned in [`tools/security-header-policy.mjs`](../../tools/security-header-policy.mjs)
and applied by the Worker in
[`infra/cloudflare/edge-security-headers/`](../../infra/cloudflare/edge-security-headers/).

Nothing continuously verified that **live production** matched that policy. The
`Live Contract Monitor` workflow was meant to, but it probes from GitHub-hosted
runners whose datacenter IPs Cloudflare challenges at the edge before the request
reaches origin. A challenged probe returns `403` whether the site is up or down,
so the monitor could only ever report `inconclusive` and re-filed a "blocked by
Cloudflare" issue every run. It provided no real coverage, and two kinds of drift
had accumulated unseen:

1. The deployed Worker predated the CSP-hardening commits, so production emitted a
   stale CSP (missing the Cloudflare Insights script hash; `style-src` still had
   `'unsafe-inline'`).
2. Cloudflare was injecting its own first-party scripts (Web Analytics inline
   bootstrap, the `/cdn-cgi/challenge-platform/` sensor) into the HTML **after**
   the Worker runs, which the Worker's sanitizer cannot remove.

## Decision

The edge security headers and the public-HTML surface are a **contract that live
production must satisfy**, verified continuously by the Live Contract Monitor.
When production drifts, we fix production (or its Cloudflare configuration) — we do
**not** relax the contract to match the drift.

Concretely:

- **The monitor observes production through a header-gated bypass.** It sends a
  secret header (`LIVE_MONITOR_BYPASS_TOKEN` → `x-live-monitor-token`) that a
  Cloudflare WAF "Skip" rule matches to wave the observer past challenge-issuing
  features. The rule is scoped to that header only and skips only challenge
  products (Browser Integrity Check, Security Level) — never managed WAF, rate
  limiting, or block rules. Free **Bot Fight Mode** is not skippable by any rule,
  so it must be **off** for the observer to reach origin.
- **Cloudflare's automatic script injection is disallowed, not accepted.** The
  contract deliberately permits the _external_ Web Analytics beacon
  (`static.cloudflareinsights.com/beacon.min.js`) but rejects Cloudflare's
  _automatic inline_ injection and the challenge-platform sensor. Production must
  therefore use **manual** Web Analytics (external beacon) and keep **JavaScript
  Detections off** — not weaken the monitor's HTML-surface rules.
- **`style-src` stays strict (`'self'`).** The self-contained offline fallback
  page (`astro-poc/public/pages/offline.html`) must render with no network, so its
  inline critical CSS is allowed via a pinned `'sha256-…'` hash rather than
  `'unsafe-inline'`. A drift guard in
  [`test/security-header-policy.test.js`](../../test/security-header-policy.test.js)
  recomputes the hash from the page and fails if it is not pinned.

## Consequences

- The monitor is conclusive: it reports `passed`, or `failed` on genuine drift —
  never a silent `inconclusive`. A red run is real signal about production.
- Operating the bypass and clearing drift are documented in
  [`docs/operations/LIVE_CONTRACT_MONITOR.md`](../operations/LIVE_CONTRACT_MONITOR.md)
  and [`docs/operations/EDGE_SECURITY_HEADERS.md`](../operations/EDGE_SECURITY_HEADERS.md):
  redeploy the Worker to correct header drift; use the two Cloudflare toggles above
  to correct HTML-surface drift.
- The bypass token is a shared secret held in the GitHub Actions secret and the WAF
  rule; rotate it in both places if it leaks. Turning Bot Fight Mode off trades some
  edge bot protection for observability; Browser Integrity Check remains active for
  ordinary traffic.
- Changing the offline page's inline CSS requires updating `OFFLINE_STYLE_HASH`;
  the guard test makes that failure loud instead of silent.
