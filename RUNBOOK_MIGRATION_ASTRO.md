# RUNBOOK_MIGRATION_ASTRO

Last updated: 2026-02-19  
Scope: Post-cutover Astro production operations for `elrincondeebano.com`

## 1) Production Freeze State

- Current production commit SHA (GitHub Pages deploy baseline): `c83441cff38fd700157138fac700e4e35c4c8bb2`
- Last pre-cutover legacy SHA (historical fallback only): `20e771af04ad51043875b1b131cb9e5eae657c82`
- Authoritative production deploy workflow: `.github/workflows/static.yml`
- Supporting verification workflow: `.github/workflows/post-deploy-canary.yml` (artifact contract path)

## 2) Single Deploy Path (Authoritative)

Production deployment is GitHub Pages only:

- Trigger source: `Continuous Integration` success on `main`
- Deploy workflow: `Deploy static content to Pages` (`static.yml`)
- Output deployed: `astro-poc/dist`
- Manual deploy override for rollback/replay: `workflow_dispatch` input `deploy_ref`

Verification commands:

```powershell
gh run list --branch main --limit 10
gh run view <static_run_id>
```

Expected:

- `Continuous Integration` on `main`: success
- `Deploy static content to Pages` on `main`: success

## 3) Contract Checklist (Operational)

These URLs/artifacts must remain valid:

- `/`
- `/bebidas.html`
- `/vinos.html`
- `/e.html`
- `/offline.html`
- `/pages/*.html` (including `/pages/offline.html`)
- `/robots.txt`
- `/sitemap.xml`
- `/404.html`
- `/service-worker.js`
- `/data/product_data.json`
- `/p/:sku/`
- `/assets/**` referenced by data/pages

Automated enforcement:

- `npm --prefix astro-poc run contract:http`
- `npm --prefix astro-poc run assets:validate`
- `npm --prefix astro-poc run contract:artifacts`
- `npm run certify:migration`

## 4) Fast Rollback (Minutes)

## Primary rollback target

Use the latest certified stable SHA:

- `c83441cff38fd700157138fac700e4e35c4c8bb2`

## Rollback procedure (manual dispatch, recommended)

1. Open Actions -> `Rollback Pages Deploy`.
2. Run workflow with:
   - `rollback_ref=c83441cff38fd700157138fac700e4e35c4c8bb2`
   - `confirm_rollback=ROLLBACK`
3. Wait for deploy job success.
4. Verify critical paths:
   - `/`
   - `/bebidas.html`
   - `/offline.html`
   - `/pages/bebidas.html`
   - `/service-worker.js`
   - `/data/product_data.json`

CLI equivalent:

```powershell
gh workflow run ".github/workflows/rollback.yml" `
  -f rollback_ref=c83441cff38fd700157138fac700e4e35c4c8bb2 `
  -f confirm_rollback=ROLLBACK
```

## Alternate rollback path

Use `Deploy static content to Pages` (`static.yml`) manual dispatch with:

- `deploy_ref=<sha_or_ref_to_restore>`

## Historical fallback (legacy storefront)

`20e771af04ad51043875b1b131cb9e5eae657c82` is pre-cutover legacy code. Treat this as disaster recovery only; it is not the fast rollback path.

## 5) When to Rollback

Rollback immediately if any condition is true:

- Homepage unavailable or repeated 5xx/4xx for `/`
- Legacy route contract break (`/pages/*.html`) on production
- Product data unavailable (`/data/product_data.json` non-200)
- Service worker route broken (`/service-worker.js` non-200)
- Critical asset contract break (`/assets/**` referenced URLs returning 404)
- Checkout/WhatsApp flow broken in smoke

## 6) When NOT to Rollback

Do not rollback for:

- GitHub-runner-only live probe 403 caused by edge filtering (artifact contracts still green)
- Non-blocking observability warnings with no user-facing regression
- Documentation-only CI failures
- Optional canary paths that are outside production contract

## 7) Post-Deploy Verification Commands

```powershell
@(
  "https://elrincondeebano.com/",
  "https://elrincondeebano.com/pages/bebidas.html",
  "https://elrincondeebano.com/pages/vinos.html",
  "https://elrincondeebano.com/pages/offline.html",
  "https://elrincondeebano.com/robots.txt",
  "https://elrincondeebano.com/sitemap.xml",
  "https://elrincondeebano.com/404.html",
  "https://elrincondeebano.com/service-worker.js",
  "https://elrincondeebano.com/data/product_data.json"
) | ForEach-Object {
  try {
    $r = Invoke-WebRequest -Uri $_ -MaximumRedirection 5 -UseBasicParsing
    "$($r.StatusCode)`t$_"
  } catch {
    "ERR`t$_`t$($_.Exception.Message)"
  }
}
```

## 8) Incident Notes

- Current known runner limitation: GitHub-hosted probes can receive `403` from edge protection.  
  This does not by itself indicate production regression; use artifact contract checks and live probes from allowed networks.
- Queued or stale canary workflow dispatches can block fresh canary runs under concurrency. Cancel stale queued runs before re-dispatching.
