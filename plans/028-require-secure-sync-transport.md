# Plan 028: Require secure transport for authenticated catalog sync

> **Executor instructions**: Execute in order, never include token values in logs/tests/plans, and update `plans/README.md` when complete.
>
> **Drift check (run first)**: `git diff --stat 877f179..HEAD -- admin/product_manager/sync.py admin/product_manager/tests/test_sync_engine_headers.py .env.example docs/operations/RUNBOOK.md`

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `877f179`, 2026-07-14

## Why this matters

The admin sync client accepts remote HTTP URLs and sends its bearer credential to them. A network observer can capture that credential and mutate catalog data. HTTP should remain available only for explicit loopback development; authenticated remote sync must require HTTPS.

## Current state

- `sync.py:160-171` accepts any `http` or `https` host.
- `sync.py:180-188` emits `Authorization: Bearer ...` when configured.
- `sync.py:376-400` sends the PATCH without a later transport restriction.
- Existing header tests live in `admin/product_manager/tests/test_sync_engine_headers.py`.

## Commands you will need

| Purpose     | Command                                                                    | Expected |
| ----------- | -------------------------------------------------------------------------- | -------- |
| Tests       | `python -m pytest admin/product_manager/tests/test_sync_engine_headers.py` | all pass |
| Python gate | `cd admin/product_manager && python -m ruff check . && python -m pytest`   | exit 0   |

## Scope

**In scope**: drift-check files; docs only if they currently advertise remote HTTP.

**Out of scope**: token rotation, server authentication design, certificate pinning, secret values, changing API paths.

## Git workflow

- Branch: `advisor/028-secure-sync-transport`
- Commit: `fix(security): require https for remote sync`

## Steps

### Step 1: Centralize transport validation

Add a helper using `urllib.parse.urlparse` and `ipaddress` where useful. Allow HTTP only when hostname is exactly `localhost`, a loopback IP (`127.0.0.0/8`, `::1`), or its bracketed URL form. Reject userinfo, missing host and malformed ports. Require HTTPS for every other host, whether or not a token is present, so later token configuration cannot create an insecure combination.

**Verify**: unit tests cover HTTPS remote accepted; HTTP public hostname/private LAN IP rejected; HTTP loopback accepted; deceptive names such as `localhost.example` rejected.

### Step 2: Fail closed with actionable logging

Invalid transport must set normalized base to empty/disable sync and log scheme/host only—never token or full credential-bearing headers. Ensure pull and patch share the same normalized base.

**Verify**: focused pytest passes and asserts no credential value appears in captured logs.

### Step 3: Run Python gate

**Verify**: Python gate command → exit 0.

## Test plan

Model construction/header assertions after `test_sync_engine_headers.py`. Include IPv4/IPv6 loopback and remote HTTP regression cases.

## Done criteria

- [ ] Authenticated data never leaves over remote HTTP.
- [ ] Loopback HTTP remains supported for development.
- [ ] Logs contain no token values.
- [ ] Ruff and full admin pytest pass.

## STOP conditions

- A documented supported production deployment uses remote HTTP and cannot migrate immediately.
- Proxy/TLS termination means the configured URL is intentionally HTTP across a trusted private hop; report the deployment contract for maintainer decision.

## Maintenance notes

Any future alternate transport must preserve credential confidentiality. A committed or exposed token must be rotated; removing it from configuration is insufficient.
