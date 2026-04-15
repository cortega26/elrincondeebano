# ADR 0004: Deploy via GitHub Pages behind Cloudflare

- Date: 2025-Q3
- Status: Accepted

## Context

The project needed a zero-cost, low-maintenance deployment path for a static storefront, with CDN, HTTPS, and security hardening headers (CSP, HSTS, frame protection, etc.).

GitHub Pages serves the static build but does not support custom response headers. Security headers therefore cannot be delivered from the origin server.

## Decision

1. Deploy `astro-poc/dist/` to GitHub Pages via the `actions/deploy-pages` GitHub Action (workflow: `.github/workflows/static.yml`).
2. Place Cloudflare in front of GitHub Pages as a reverse proxy.
3. Apply edge security headers (CSP, HSTS, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, frame protection) via a **Cloudflare Worker** defined in `infra/cloudflare/`.

## Consequences

### Positive

- Free, globally CDN-cached hosting with automated CI/CD.
- Security headers are enforced at the edge without touching the static build.
- Cloudflare's DDoS protection and challenge pages are available by default.

### Critical constraints for agents

- **Security headers live at the Cloudflare edge, not in the static build.** To fix missing or incorrect headers, update the Cloudflare Worker in `infra/cloudflare/` and deploy with `npm run cloudflare:deploy:edge-security-headers`. Do NOT add `<meta http-equiv>` CSP tags or similar workarounds to Astro source files — meta-tag CSP is a weaker mechanism and would duplicate/conflict with the edge policy.
- **Cloudflare may challenge GitHub-hosted CI runners.** The scheduled Live Contract Monitor (`live-contract-monitor.yml`) and any live HTTP probes must run from the **self-hosted runner** (`self-hosted, linux, x64`), because GitHub-hosted runners may receive Cloudflare-managed `403` challenge pages that do not reflect the actual public contract.
- **The only acceptable Cloudflare analytics surface** is the external `https://static.cloudflareinsights.com/beacon.min.js` beacon. Inline Cloudflare Insights bootstrap snippets and `rocket-loader.min.js` injections are treated as edge drift and must be removed rather than whitelisted in CSP.
- **Deploy path:** GitHub Pages is the content origin. Cloudflare is only a proxy/edge layer. Fixing a content regression requires a new GitHub Pages deploy; fixing a header/security regression requires a Cloudflare Worker deploy.

### Related runbook

`docs/operations/RUNBOOK.md` — "Missing edge security headers" section.
`docs/operations/EDGE_SECURITY_HEADERS.md` — full header baseline.
