# 1. Executive verdict
- Overall security posture: the live public site is a static Astro storefront with a relatively small interactive attack surface, but the migration is not cleanly hardened. The highest-risk issues are not classic backend bugs; they are security controls that fell off during migration, legacy residue still wired into service worker/offline/SEO behavior, and conflicting route authority signals that are already live.
- Top 3 real risks:
  - `RT-01` Active Astro pages ship without CSP or other browser hardening headers, while the legacy EJS path still contains the old CSP logic. The hardening did not survive the migration to the actual production path.
  - `RT-02` The deployed service worker and offline page still reference retired EJS-era `/dist/*` assets that return `404` in production, degrading offline behavior and proving legacy/static fallback logic is still coupled to the wrong output contract.
  - `RT-03` Production publishes multiple duplicate route families and a conflicting canonical host strategy (`www` is live, apex is canonical/sitemap), creating real SEO/reputation risk and proving the migration did not end with a single clean public URL authority.
- Top 3 things that looked scary but are actually non-issues or lower risk:
  - The repo contains a sync API and admin tooling, but the public site deployed from GitHub Pages does not expose them. On 2026-03-11, `/api/products/changes`, `/admin/`, and `/admin-panel/` all returned `404`.
  - I did not find active Astro XSS primitives such as `set:html`, MDX raw HTML pipelines, or DOM sinks fed from query params in the production storefront. The current Astro surface is materially safer than the archived EJS surface here.
  - Production dependency audit and secret scan were clean: `npm audit --omit=dev` reported `0 vulnerabilities` and `npm run security:secret-scan` reported no high-confidence secrets.
- Migration verdict: the Vanilla EJS → Astro transition is functionally migrated but still carries cleanup debt and some confirmed harmful residue. I would not call it fully decommissioned and clean.

# 2. Architecture and attack-surface summary
- Deployment model:
  - Astro SSG only. `astro-poc/astro.config.mjs:3-6` sets `output: 'static'`.
  - GitHub Pages is the authoritative production path. `.github/workflows/static.yml:136-141` uploads `astro-poc/dist`.
- Static vs dynamic reality:
  - Static routes: `/`, `/404.html`, `/p/<sku>/`, `/pages/<slug>.html`, `/c/<category>/`, plus root compatibility pages such as `/bebidas.html`, `/vinos.html`, `/offline.html`.
  - No SSR, no server middleware, no Astro API endpoints, no forms posting to origin.
  - Client-side behavior is limited to cart state in `localStorage`, filtering/sorting, WhatsApp order handoff, and service worker registration (`astro-poc/src/scripts/storefront.js`).
- Major trust boundaries:
  - Build-time catalog data: `data/product_data.json` copied into `astro-poc/src/data/products.json` and `astro-poc/public/data/product_data.json` by `astro-poc/scripts/sync-data.mjs:10-22,155-164`.
  - Build-time category registry: `data/category_registry.json` copied into `astro-poc/src/data/categories.json` by the same sync script.
  - Root static assets and service worker are copied into Astro public by `astro-poc/scripts/sync-data.mjs:17-22,161-164`.
  - Third-party runtime dependency: Bootstrap CSS/JS from jsDelivr with SRI in `astro-poc/src/layouts/BaseLayout.astro:66-71,94-100`.
  - Public catalog JSON: `/data/product_data.json` is intentionally exposed and cached.
- Major third-party dependencies/integrations:
  - jsDelivr for Bootstrap assets.
  - Cloudflare/Fastly/GitHub Pages serving chain observed at runtime on 2026-03-11.
  - WhatsApp deep-link handoff from `astro-poc/src/scripts/storefront.js:576-614`.
- What is not present and therefore not a valid concern:
  - No public auth/session layer.
  - No public-origin POST form handling.
  - No live public sync API on the deployed Pages site.
  - No evidence of `set:html`, `dangerouslySetInnerHTML`, or URL-param-driven HTML rendering in the active Astro storefront.

# 3. Migration and decommission summary
- Where legacy Vanilla EJS residue was found:
  - Source/templates: `templates/*.ejs`, `tools/build.js`, `tools/build-pages.js`, `tools/build-index.js`, `tools/copy-static.js`.
  - Shared runtime artifacts: root `service-worker.js`, `robots.txt`, `app.webmanifest`, `static/offline.html`.
  - Documentation/tests: `README.md:63-68,99-108`, `test/csp.policy.hardening.test.js:29-52`, `test/template.seo-accessibility.test.js`, `test/buildIndex.lcp.test.js`, `test/noFlicker.stylesheetLoading.test.js`.
  - Generated ignored output still present locally: `build/`.
- Whether output/build/deploy authority is now singular and coherent:
  - Deploy authority is singular: GitHub Pages publishes only `astro-poc/dist`.
  - Public URL authority is not coherent: the build emits legacy root routes, legacy `/pages/*.html`, modern `/c/*`, and mixed-case `/c/<Key>/` variants simultaneously, then indexes them in one sitemap.
- Whether any old dist/public/build artifacts still create risk:
  - Yes. The service worker and offline page still point at retired `/dist/*` assets that do not exist in production.
  - Yes. Offline fallback content still ships stale structured-data and legacy CSS preloads.
  - Yes. Root EJS-specific security testing still exists, but it no longer validates the live Astro head/headers.
- Whether cleanup is complete, partial, or insufficient:
  - Partial. The production build path moved to Astro, but legacy source, fallback assets, route duplication, and parts of the verification story were not fully decommissioned.

# 4. Findings table
| ID | Severity | Confidence | Affected area | Short title | Exploitability summary | Remediation priority |
| --- | --- | --- | --- | --- | --- | --- |
| RT-01 | Medium | High | Browser security posture / migration hardening | Astro production path lost CSP and browser hardening | Any future content/script injection or framed phishing attempt gets full browser execution latitude because live pages ship without CSP, frame restrictions, or related hardening | Immediate |
| RT-02 | Medium | High | Service worker / offline / legacy residue | Deployed SW and offline fallback still target retired EJS assets | Production SW precache and offline HTML reference `/dist/*` files that return `404`, degrading resilience and proving legacy output assumptions are still active | Immediate |
| RT-03 | Medium | High | SEO / routing / migration coherence | Public route authority is fragmented across hosts and duplicate route families | Search engines and users can reach multiple 200 variants of the same content; sitemap and canonical signals conflict with the live host and include low-trust offline/compat pages | Short term |
| RT-04 | Low | High | Governance / maintainability / verification | Archived EJS pipeline still shapes docs, tests, and assurance | Not directly deployable today, but it creates false confidence and already hid a production hardening regression by testing the wrong output surface | Short term |

# 5. Detailed findings
## RT-01. Astro production path lost CSP and browser hardening
1. Title
   Astro production path lost CSP and browser hardening
2. Severity
   Medium
3. Confidence
   High
4. Why it matters
   The public site is mostly static, so the dominant value of CSP and related headers here is blast-radius reduction. Right now, if a future content pipeline regression, third-party compromise, or DOM injection bug lands, the browser gives it full origin privileges. Separately, no frame restrictions means the storefront can be embedded in hostile pages to mimic the WhatsApp order flow.
5. Attack path
   1. An attacker finds or creates any script-capable injection path in future content or client code.
   2. The payload executes without CSP or Trusted Types constraints because the active Astro pages ship none.
   3. The attacker reads/modifies DOM, cart state, and WhatsApp order text, or uses clickjacking because the site is frameable.
6. Evidence
   - Active Astro head has no CSP bootstrap or header logic: `astro-poc/src/layouts/BaseLayout.astro:37-100`.
   - Legacy CSP still exists, but only in the retired path: `src/js/csp.js:1-46`.
   - CSP regression tests target only EJS templates: `test/csp.policy.hardening.test.js:29-52`.
   - Production response headers observed on 2026-03-11 for `https://www.elrincondeebano.com/` and `/pages/bebidas.html` contained no `Content-Security-Policy`, `X-Frame-Options`, `Referrer-Policy`, `X-Content-Type-Options`, or `Permissions-Policy`.
   - Production HTML head observed on 2026-03-11 contained no CSP meta tag.
7. Applicability check
   - I did not confirm a current XSS path in active Astro pages.
   - This is still a real issue because the migration removed a meaningful defense layer from the actual production output while tests kept validating only the retired EJS path.
8. Remediation
   - Minimal safe fix:
     - Set CSP, `frame-ancestors` or `X-Frame-Options`, `Referrer-Policy`, `X-Content-Type-Options`, and a minimal `Permissions-Policy` at the Cloudflare edge for the Astro site.
     - Add a built-output check for Astro pages, not just template-source checks.
   - Stronger long-term fix:
     - Treat security headers as deployment contract, not template behavior.
     - Add a preview/live canary that curls the deployed site and asserts required headers.
9. Regression protection
   - CI gate that validates security headers against a preview deployment or a local header-emitting static server.
   - Replace `test/csp.policy.hardening.test.js` with checks against `astro-poc/dist/*.html` and live headers.
10. Residue classification
   Confirmed harmful residue
11. Decommission action
   Remove legacy-only CSP assurance from active confidence claims; keep legacy CSP code only if it is clearly archived and not treated as active protection.

## RT-02. Deployed service worker and offline fallback still target retired EJS assets
1. Title
   Deployed service worker and offline fallback still target retired EJS assets
2. Severity
   Medium
3. Confidence
   High
4. Why it matters
   This storefront explicitly markets offline-first behavior. The live service worker still precaches files from the retired EJS output contract, and the shipped offline page still preloads legacy CSS that no longer exists. That is a confirmed migration regression in resilience, not a hypothetical style nit.
5. Attack path
   1. A user installs/refreshes the service worker after deployment.
   2. The service worker attempts to precache legacy `/dist/*` bundles that do not exist.
   3. Offline or degraded-network behavior falls back to a stale legacy page with dead CSS preloads and stale structured-data.
   4. Search engines can also discover those low-trust offline surfaces because they remain publicly reachable.
6. Evidence
   - Live deployed service worker still precaches retired EJS assets: `astro-poc/dist/service-worker.js:18-32`.
   - Production `404` observed on 2026-03-11 for:
     - `https://www.elrincondeebano.com/dist/js/script.min.js`
     - `https://www.elrincondeebano.com/dist/css/style.min.css`
     - `https://www.elrincondeebano.com/dist/css/critical.min.css`
   - Active Astro pages load `/_astro/...` bundles instead of `/dist/*`: built HTML in `astro-poc/dist/index.html` and `astro-poc/dist/pages/bebidas.html` references `/_astro/storefront.C4fePR2V.js` and `/_astro/_category_.4okezZJW.css`.
   - Offline fallback source still contains legacy preload and stale structured-data:
     - `static/offline.html:14`
     - `static/offline.html:31-42`
     - `astro-poc/public/pages/offline.html:14`
     - `astro-poc/public/pages/offline.html:31-42`
   - Asset validation cannot catch this class because it only validates `/assets/...` refs: `astro-poc/scripts/validate-asset-contract.mjs:40-46,112-139`.
7. Applicability check
   - This is confirmed in production by live `404` responses.
   - The service worker does tolerate fetch failures and continues installation, so this is degradation rather than total failure.
8. Remediation
   - Minimal safe fix:
     - Regenerate `CACHE_CONFIG.staticAssets` from actual `astro-poc/dist` output.
     - Remove `/dist/*` references from `service-worker.js`.
     - Replace or simplify `static/offline.html` so it references only live assets and no stale JSON-LD.
   - Stronger long-term fix:
     - Build the offline page from Astro or a dedicated shared template bound to the current asset manifest.
     - Derive SW precache entries from build artifacts, not hand-maintained legacy lists.
9. Regression protection
   - CI test that fetches every SW precache URL from the built artifact tree and fails on missing files.
   - CI test that scans all HTML and SW files for dead `/dist/*` references once the legacy path is retired.
10. Residue classification
   Confirmed harmful residue
11. Decommission action
   Remove or rewrite legacy `/dist/*` references and the stale offline page contract.

## RT-03. Public route authority is fragmented across hosts and duplicate route families
1. Title
   Public route authority is fragmented across hosts and duplicate route families
2. Severity
   Medium
3. Confidence
   High
4. Why it matters
   This is already live and indexable. The same content is published under multiple 200 URLs, the sitemap emits those duplicates, and the canonical host does not match the host users actually receive. That creates real SEO trust, crawl-budget, and reputation risk, especially around low-trust pages such as offline fallbacks.
5. Attack path
   1. A crawler, scraper, or competitor discovers all indexed variants from the sitemap.
   2. Search engines see mixed host signals and duplicate route families.
   3. Legacy/offline URLs are indexed or surfaced instead of the intended clean storefront routes.
   4. Search relevance and trust signals dilute, and stale compatibility pages remain discoverable.
6. Evidence
   - Dual category route generation:
     - `astro-poc/src/lib/catalog.ts:359-380` emits both slug and key params.
     - `astro-poc/src/pages/c/[category].astro:15-24` builds `/c/<param>/` routes from both.
     - `astro-poc/src/pages/pages/[slug].html.astro:15-27` also emits `/pages/*.html`.
   - Root compatibility pages are copied into dist: `astro-poc/scripts/postbuild-legacy-pages.mjs:10-18,41-50`.
   - Sitemap blindly includes every built HTML file: `astro-poc/scripts/postbuild-sitemap.mjs:38-46`.
   - Canonical origin is hard-coded to apex: `astro-poc/src/lib/seo.ts:5,30-38`.
   - Live runtime behavior observed on 2026-03-11:
     - `https://elrincondeebano.com/` returns `301` to `https://www.elrincondeebano.com/`.
     - `https://www.elrincondeebano.com/` returns `200` but canonical points to `https://elrincondeebano.com/`.
     - `sitemap.xml` lists apex-host URLs plus `/c/bebidas/`, `/c/Bebidas/`, `/pages/bebidas.html`, `/bebidas.html`, `/offline.html`, and `/pages/offline.html`.
     - All of `/c/bebidas/`, `/c/Bebidas/`, `/pages/bebidas.html`, and `/bebidas.html` return `200`.
7. Applicability check
   - This is confirmed live, not inferred.
   - The canonical tag mitigates some duplicate harm, but it does not excuse publishing duplicates in the sitemap or host mismatch.
8. Remediation
   - Minimal safe fix:
     - Pick one public host and make `SITE_ORIGIN` match it.
     - Remove mixed-case `/c/<Key>/` routes from `getCategoryRouteParams`.
     - Remove offline pages and legacy compat routes from sitemap if they must remain reachable.
   - Stronger long-term fix:
     - Redirect legacy routes to a single canonical route family instead of serving multiple 200 variants.
     - Treat compatibility pages as transitional exceptions with explicit noindex or redirects.
9. Regression protection
   - CI route audit that normalizes case and rejects duplicate sitemap entries.
   - CI check that canonical host matches the deployed host.
   - CI check that sitemap excludes offline pages and other non-indexable compatibility URLs.
10. Residue classification
   Confirmed harmful residue
11. Decommission action
   Keep only the minimum compatibility routes needed for user bookmarks, but stop indexing them and stop emitting duplicate modern variants.

## RT-04. Archived EJS pipeline still shapes docs, tests, and assurance
1. Title
   Archived EJS pipeline still shapes docs, tests, and assurance
2. Severity
   Low
3. Confidence
   High
4. Why it matters
   This is not a direct remote exploit, but it is a hardening failure mode. The repo claims the EJS path is archived, yet active docs, tests, and dependencies still treat it as current. That already contributed to missing the Astro CSP/header regression.
5. Attack path
   1. A maintainer relies on legacy template tests/docs as if they described the live storefront.
   2. A migration regression lands in Astro output.
   3. CI stays green because the tests and docs still validate/archive the wrong surface.
6. Evidence
   - Root package still carries `ejs` as an active dependency: `package.json:76-79`.
   - Archived-but-present legacy build tooling remains in main:
     - `tools/build.js`
     - `tools/build-pages.js`
     - `tools/build-index.js`
     - `tools/copy-static.js`
   - README still describes EJS templates as current:
     - `README.md:63-68`
     - `README.md:101-108`
   - Active tests still validate legacy template behavior:
     - `test/csp.policy.hardening.test.js:29-52`
     - `test/template.seo-accessibility.test.js`
     - `test/buildIndex.lcp.test.js`
     - `test/noFlicker.stylesheetLoading.test.js`
7. Applicability check
   - This does not create a public exploit by itself because GitHub Pages still deploys only `astro-poc/dist`.
   - It does create operational/security blind spots and maintainability drag now.
8. Remediation
   - Minimal safe fix:
     - Move legacy EJS source/tests/docs under `_archive/` or a separate branch.
     - Remove `ejs` from active dependencies if nothing in the active workflow requires it.
     - Rewrite template-based assurance against `astro-poc/dist` or Astro source.
   - Stronger long-term fix:
     - Make archive code non-runnable in normal CI and clearly out-of-scope for production.
     - Add a repository policy that active storefront docs/tests cannot reference `templates/*.ejs`.
9. Regression protection
   - CI grep gate that fails if active docs/tests reference retired templates outside archive docs.
   - Coverage review requiring new storefront hardening checks to point at Astro build output.
10. Residue classification
   Confirmed harmful residue
11. Decommission action
   Archive or remove the EJS pipeline from `main`; do not keep it half-alive.

# 6. Legacy cleanup and migration verification findings
## Harmful residue confirmed
- Service worker precache list still includes retired EJS assets (`astro-poc/dist/service-worker.js:18-32`) that return live `404`s in production.
- Offline fallback page is still a legacy artifact (`static/offline.html`, `astro-poc/public/pages/offline.html`) with dead CSS preloads and stale structured-data.
- Modern and compatibility route families coexist and are all indexed via sitemap.
- Canonical/sitemap host points to apex while production serves `www`, creating conflicting authority.
- EJS-targeted docs/tests remain in active repo paths and missed hardening drift in the live Astro path.

## Safe intentional retention
- Deploy authority itself is singular and coherent: `.github/workflows/static.yml:136-141` uploads only `astro-poc/dist`.
- Legacy root compatibility routes such as `/bebidas.html` and `/vinos.html` appear intentionally retained for bookmark/backward-compatibility reasons. That retention is safe only if they are treated as secondary and not indexed as primary URLs.
- Root build output directory `build/` is ignored by Git and is not part of the production deployment contract.

## Unclear residue requiring cleanup decision
- Whether root compatibility pages (`/bebidas.html`, `/vinos.html`, `/offline.html`) should remain 200 forever or transition to redirects/noindex.
- Whether the optional sync API/admin stack belongs in `main` alongside the static storefront or should live in a separate operational repo/package boundary.
- Whether the public catalog JSON should continue exposing operational metadata fields such as `field_last_modified`, `rev`, and `by`.

## Functional parity/regression concerns
- Core route availability is good. `npm run build`, `npm test`, and `npm run typecheck` all passed on 2026-03-11.
- Legacy compatibility routes do resolve in production: `/pages/bebidas.html`, `/bebidas.html`, `/offline.html`.
- The biggest parity regression is not route absence; it is route over-publication and stale offline/service-worker coupling.

## Efficiency/optimization concerns
- Build output duplicates the same category content across `/c/<slug>/`, `/c/<Key>/`, `/pages/<slug>.html`, and some root compat pages.
- Sitemap generation is file-tree based, so duplication automatically expands crawl surface and deploy artifact count.
- Service worker precaches dead URLs, creating avoidable installation noise and wasted network work.

## Maintainability/scalability concerns
- There are still dual mental models in the repo: “Astro is the only supported storefront” and “EJS templates are current” both appear in active documentation.
- Security assurance is split between active Astro output and archived template tests, which is precisely how RT-01 escaped.
- Shared root assets/contracts (`service-worker.js`, `robots.txt`, manifest, offline page) still carry legacy assumptions and should either be owned by the Astro build or explicitly archived.

## Closure criteria
- Migration status: functionally migrated but with cleanup debt.
- Justification:
  - Production deploy authority is singular.
  - Public route/SEO authority is not singular.
  - Service worker/offline compatibility still depends on retired path conventions.
  - Verification still partially targets legacy source instead of live Astro output.

# 7. Near-misses and suspicious patterns
- `astro-poc/src/lib/catalog.ts:173-190` accepts absolute `http(s)` image URLs, and `astro-poc/src/lib/seo.ts:133-138` would propagate those into product OG URLs. Current data is clean, but the content contract does not force local-only image origins.
- `astro-poc/scripts/sync-data.mjs:100-112` only blocks path traversal for image fields. It does not enforce a strict `assets/images/...` contract at build sync time.
- `data/product_data.json` is public and includes operational metadata (`field_last_modified`, `rev`, `by`). Not a secret leak, but broader than necessary for a public catalog contract.
- `README.md:25-35` still documents stale service-worker cache versions (`v6/v4/v5`) while the live file is already `v7/v5/v6/html-v1`, which is another sign of migration/runtime docs drift.

# 8. False positives avoided
- I did not report the sync API as a public web finding because the live Pages deployment does not expose it. On 2026-03-11, `/api/products/changes?since_rev=0` returned `404`.
- I did not report admin exposure because `/admin/` and `/admin-panel/` both returned `404` in production.
- I did not report active Astro XSS because I did not find `set:html`, MDX raw HTML, or DOM sinks fed by URL/query-controlled input in the deployed storefront path.
- I did not report source map leakage because `/_astro/_category_.4okezZJW.css.map` returned `404` in production.
- I did not report production dependency vulnerabilities or committed secrets because `npm audit --omit=dev` and `npm run security:secret-scan` were both clean.
- I did not treat `Access-Control-Allow-Origin: *` on public HTML/JSON as a primary finding because the exposed data is intentionally public and there is no credentialed API behind it.

# 9. Prioritized remediation plan
## Immediate (today)
- Restore browser hardening on the actual Astro deployment path.
  - Why it matters: closes the biggest hardening gap that the migration introduced.
  - Expected risk reduction: high for future injection/clickjacking blast radius.
  - Implementation difficulty: medium.
  - Regression risk: low if applied at the edge and validated against preview.
- Remove dead `/dist/*` precache targets from `service-worker.js` and rewrite `offline.html` to current Astro assets only.
  - Why it matters: fixes confirmed broken offline/resilience residue.
  - Expected risk reduction: medium.
  - Implementation difficulty: medium.
  - Regression risk: medium because service-worker changes need cache/version coordination.
- Stop indexing offline and compatibility pages in sitemap immediately.
  - Why it matters: reduces live duplicate/low-trust crawl surface now.
  - Expected risk reduction: medium for SEO/reputation.
  - Implementation difficulty: low.
  - Regression risk: low.

## Short term (this week)
- Collapse route authority to one canonical host and one canonical route family.
  - Why it matters: removes the biggest migration-era SEO inconsistency.
  - Expected risk reduction: medium.
  - Implementation difficulty: medium.
  - Regression risk: medium because old bookmarks/links may need redirects.
- Replace legacy EJS security/template tests with Astro build-output tests.
  - Why it matters: prevents false confidence and aligns assurance with what is deployed.
  - Expected risk reduction: medium.
  - Implementation difficulty: medium.
  - Regression risk: low.
- Decide whether root compatibility routes remain as redirects, noindex pages, or removed paths.
  - Why it matters: clarifies closure of the migration instead of keeping ambiguous “temporary forever” behavior.
  - Expected risk reduction: medium.
  - Implementation difficulty: medium.
  - Regression risk: medium.

## Structural (hardening / governance / CI)
- Move or archive the retired EJS pipeline out of active repo surface.
  - Why it matters: removes dual-stack drift and maintenance ambiguity.
  - Expected risk reduction: medium.
  - Implementation difficulty: medium to high.
  - Regression risk: low if archived cleanly.
- Make service-worker/offline/canonical/sitemap behavior artifact-driven rather than manually curated.
  - Why it matters: removes a class of migration residue permanently.
  - Expected risk reduction: high for future regressions.
  - Implementation difficulty: high.
  - Regression risk: medium.
- Add live or preview contract checks for headers, sitemap uniqueness, and SW asset existence.
  - Why it matters: catches the exact failures found here before production.
  - Expected risk reduction: high.
  - Implementation difficulty: medium.
  - Regression risk: low.

## 9.1 Legacy decommission actions
- `templates/`, `tools/build*.js`, `tools/copy-static.js`
  - Action: archive or remove from `main`.
  - Why: confirmed harmful residue via false assurance and docs/test drift.
  - Owner surface affected: docs, tests, build tooling.
  - Regression protection needed: CI block on active references outside archive docs.
- Root `service-worker.js`
  - Action: keep, but rewrite under Astro-owned contract.
  - Why: it is active in production but still encodes legacy output assumptions.
  - Owner surface affected: offline UX, caching, deploy artifacts.
  - Regression protection needed: artifact-driven SW asset validation.
- `static/offline.html` / `astro-poc/public/pages/offline.html`
  - Action: remove legacy content or rebuild from current Astro contract.
  - Why: confirmed stale fallback/SEO residue.
  - Owner surface affected: offline UX, SEO.
  - Regression protection needed: HTML contract test for offline page assets and noindex behavior.
- Root compatibility HTML pages (`/bebidas.html`, `/vinos.html`, `/offline.html`)
  - Action: keep only if required for backward compatibility; otherwise redirect or remove.
  - Why: safe intentional retention only if they are not indexed as primary pages.
  - Owner surface affected: routing, SEO, bookmarks.
  - Regression protection needed: sitemap/canonical policy test plus redirect/noindex checks.

# 10. Hardening gates to add
- Header validation gate:
  - curl preview/live pages and fail if CSP, frame restriction, referrer policy, nosniff, and permissions policy are absent.
- Route audit gate:
  - normalize URLs by host and case; fail if sitemap emits duplicates or offline/compat URLs meant to stay non-indexable.
- Canonical authority gate:
  - assert `SITE_ORIGIN`, sitemap host, smoke evidence base URL, and actual deploy host all match.
- Service worker contract gate:
  - parse `service-worker.js` precache list and fail if any referenced asset is missing from `astro-poc/dist`.
- Offline page contract gate:
  - fail on `/dist/*` references, `http://www.elrincondeebano.com/`, or stale JSON-LD in offline pages.
- Legacy artifact detection gate:
  - fail if active docs/tests/scripts outside archive paths reference `templates/*.ejs`, root `build/`, or other retired storefront surfaces.
- Content-pipeline validation:
  - enforce `assets/images/...`-only image paths for public catalog data unless an explicit allowlist exists.
- Secret and dependency scanning:
  - keep existing secret scan and `npm audit --omit=dev`; they are useful and currently green.
- Built-output security audit:
  - scan `astro-poc/dist/*.html` for CSP presence, inline script count, canonical consistency, and unwanted route families.

# 11. Final conclusion
- What would worry me most if this site went public at scale:
  - Not the absence of a backend. The bigger problem is that the migration left the live site with weaker browser hardening than the legacy path, and the repo still gives false signals about what is actually protected.
- What is probably acceptable for now:
  - The site being static-only is a real security advantage.
  - The public admin/API surfaces are not deployed.
  - Catalog rendering in active Astro pages is not currently exposing an obvious XSS path.
- What must be fixed before treating the site as professionally hardened:
  - Browser security headers/CSP on the actual Astro deployment path.
  - Service-worker and offline fallback cleanup so they stop referencing dead legacy assets.
  - Canonical/sitemap/host cleanup so one public URL authority exists in practice, not just in docs.
  - Removal or archival of legacy EJS assurance from active repo paths.
- Whether the Vanilla EJS migration can honestly be considered complete:
  - No. It is operationally migrated, but not fully decommissioned and clean. The deploy path is Astro-only; the security posture, offline behavior, and public URL authority still carry confirmed migration residue.
