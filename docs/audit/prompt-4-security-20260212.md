# Prompt 4 - Security Audit (2026-02-12)

## Scope executed

1. Secret scan over tracked files (`git grep` for key/token/private key patterns).
2. Dependency triage:
   - `npm audit --omit=dev --audit-level=high`
   - `python -m pip_audit -r admin/product_manager/requirements.txt --format json`
3. Python SAST sanity:
   - `python -m bandit -q -r admin/product_manager -f json`
4. Frontend rendering checks (XSS vectors):
   - `innerHTML`, `insertAdjacentHTML`, `outerHTML`, `eval`, `new Function`.
5. Sync API hardening in `server/httpServer.js` + regression tests.

## Top 10 real risks

| # | Risk | Severity | Exploitability | Status |
|---|---|---|---|---|
| 1 | Sync API responses lacked defensive security headers | Medium | Medium | Mitigated |
| 2 | Sync API URL parsing depended on request host value | Medium | Medium | Mitigated |
| 3 | Oversized PATCH body could terminate connection abruptly (reset) | Medium | Medium | Mitigated |
| 4 | Malformed encoded product IDs could fail non-deterministically | Low | Medium | Mitigated |
| 5 | Sync PATCH endpoint can be unauthenticated if deployed publicly | High | High | Mitigated |
| 6 | CSP policy includes `'unsafe-inline'` in `script-src` | Medium | Medium | Mitigated |
| 7 | CSP is delivered via `<meta http-equiv>` instead of HTTP header | Medium | Medium | Pending (hosting/platform limit) |
| 8 | No dedicated automated secret scanning gate in CI | Medium | Medium | Mitigated |
| 9 | Bandit reports broad `except` patterns in admin UI | Low | Low | Mitigated |
|10| Dependency supply-chain risk remains on dev dependency graph (not prod) | Low | Medium | Monitored (prod audit clean) |

## Fixes applied

1. Hardened JSON API responses in `server/httpServer.js`:
   - Added `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`,
     `Cross-Origin-Resource-Policy`, `Cache-Control`, `Pragma`, and a restrictive API CSP.
2. Added centralized JSON response helper for consistent safe headers and MIME type.
3. Switched request URL parsing base to fixed `http://localhost` (host-header-safe parse).
4. Added robust request-body handling:
   - deterministic `413 Payload too large`
   - deterministic `400 Invalid JSON payload`
   - graceful socket behavior (no abrupt reset path).
5. Added malformed product-id validation path (`400 Invalid product identifier`).
6. Added tests:
   - `test/httpServer.securityHeaders.test.js`
   - included in `test/run-all.js`
7. Added sync write auth controls in `server/httpServer.js`:
   - `SYNC_API_TOKEN` / `syncApiToken` for bearer verification.
   - `SYNC_API_REQUIRE_AUTH` / `requirePatchAuth` for fail-closed PATCH policy.
   - 401 on invalid/missing bearer token when auth is enabled.
   - 503 on server misconfiguration (auth required but token absent).
8. Added dedicated CI secret scanning workflow:
   - `.github/workflows/secret-scan.yml` running `npm run security:secret-scan`.
   - high-confidence token/key pattern scan over tracked files.
9. Fixed Bandit `B110/B112` findings in `admin/product_manager/ui/main_window.py`:
   - replaced broad `except` with specific exceptions and diagnostic logging.
10. Tightened storefront CSP bootstrap:
   - removed `'unsafe-inline'` from `script-src` in `src/js/csp.js`.
   - switched `csp.js` loading in templates to synchronous tag (without `async`) so policy is applied earlier.
   - added regression test `test/csp.policy.hardening.test.js`.

## Dependency and secret results

1. Secrets:
   - Result: no committed credential/token/key matches in tracked files for high-risk patterns.
2. npm production audit:
   - Result: `0` vulnerabilities (high/critical/total in prod).
3. pip audit:
   - Result: no known vulnerabilities for `admin/product_manager/requirements.txt`.
4. Bandit:
   - 3 low-severity findings (`B110/B112`) in `admin/product_manager/ui/main_window.py`.

## Notes on CSRF / forms

1. Storefront checkout flow uses WhatsApp URL composition; no cookie-authenticated server form/session flow was detected.
2. Classic CSRF risk is therefore low for the storefront path in current architecture.

## Recommended next security backlog

1. Move CSP from `<meta http-equiv>` to HTTP response headers at hosting edge.
2. Expand secret scanning to include repo-level allowlist governance and developer suppressions policy.
3. Validate strict startup mode for sync auth (`SYNC_API_STRICT_STARTUP=true`) in production deployment docs.
