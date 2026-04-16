# Share Preview Operations

## Supported contract

WhatsApp share-preview support is guaranteed only for these public route families:

- `https://www.elrincondeebano.com/`
- `https://www.elrincondeebano.com/<category>/`
- `https://www.elrincondeebano.com/p/<sku>/`

Legacy compatibility routes such as `/c/*` and `/pages/*.html` may remain reachable, but they are not part of the supported share-preview contract. They must stay canonicalized to the modern route and `noindex, follow`.

## Source of truth

- Metadata generation: `astro-poc/src/lib/seo.ts`
- Metadata rendering: `astro-poc/src/layouts/BaseLayout.astro`
- OG image generation: `npm run images:og:home`, `npm run images:og:overrides`, `npm run images:og:categories`
- Build enforcement: `astro-poc/scripts/validate-artifact-contract.mjs`
- Live validation: `npm run monitor:share-preview`

## Required validation when preview-related inputs change

Run this sequence whenever you change:

- `astro-poc/src/lib/seo.ts`
- `astro-poc/src/layouts/BaseLayout.astro`
- category/product page metadata inputs
- OG image generation scripts
- `assets/images/og/**`
- category overrides or product image references that affect social previews

Commands:

```bash
npm run build
npm test
npm run test:e2e
npm run monitor:share-preview
```

Expected results:

- build passes with no artifact-contract failures
- build-output tests confirm canonical, description, and OG/Twitter metadata alignment
- browser tests confirm supported routes expose the same metadata seen in the built HTML
- the live monitor confirms homepage, one primary category route, and one product route return a valid public preview contract and a fetchable JPG/PNG OG image

## Regenerating OG images

If the social image artwork changed, regenerate the pipeline before building:

```bash
npm run images:og:home
npm run images:og:overrides
npm run images:og:categories
```

The emitted `og:image` URLs now include a deterministic `?v=` token derived from the asset bytes. That token is part of the share-preview contract and helps force preview refreshes when the artwork changes.

## Forcing preview refresh after a change

When title, description, or OG image changes have shipped:

1. Confirm the new metadata is present in production:
   ```bash
   npm run monitor:share-preview
   ```
2. Open the affected supported URL in the Meta Sharing Debugger:
   `https://developers.facebook.com/tools/debug/`
3. Use the debugger to scrape again after deploy so the shared cache sees the updated image and description.
4. Post the same supported URL in a real WhatsApp chat and verify:
   - title
   - description
   - image

## PR evidence requirements

When a PR changes share-preview behavior or inputs, attach:

- `npm run build`
- `npm test`
- `npm run test:e2e`
- `npm run monitor:share-preview`
- one note confirming the manual Meta Sharing Debugger + WhatsApp verification outcome, or that it is still pending for the final release signoff

## Failure triage

If `npm run monitor:share-preview` fails:

1. Determine whether the failing URL is supported (`/`, `/<category>/`, `/p/<sku>/`) or legacy-only.
2. Inspect the live HTML:
   ```bash
   curl -s https://www.elrincondeebano.com/<path> | rg -n 'canonical|og:|twitter:|description'
   ```
3. Inspect the referenced image:
   ```bash
   curl -sSI 'https://www.elrincondeebano.com/assets/images/og/...'
   ```
4. Rebuild locally with `npm run build` and compare the built HTML against production.
5. If the HTML looks correct but the unfurl is stale, re-scrape in Meta Sharing Debugger and repeat the WhatsApp manual check.

### Cloudflare Bot Fight Mode blocking social crawlers

**Symptom:** monitor fails with `"returned a challenge/interstitial page instead of the public storefront"`. The OG images show as broken or missing in WhatsApp even though the physical image files and meta tags are correct.

**Root cause:** Cloudflare's Bot Fight Mode (or a WAF managed rule) is issuing JavaScript challenges to `facebookexternalhit/1.1` and `WhatsApp/*` user agents. These bots cannot execute JavaScript, so they never receive the real HTML and cannot read OG tags.

**Diagnosis:**

```bash
curl -sA "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)" \
  https://www.elrincondeebano.com/ | grep -c 'cdn-cgi/challenge-platform'
# returns 1 → bot is being challenged; returns 0 → bot is not being challenged
```

**Fix (Cloudflare dashboard — must be done manually):**

1. Go to **Security → WAF → Custom Rules** (or Firewall Rules on older plans).
2. Create a rule with the expression:
   ```
   (http.user_agent contains "facebookexternalhit") or
   (http.user_agent contains "WhatsApp") or
   (http.user_agent contains "Twitterbot")
   ```
3. Set the action to **Skip → All remaining custom rules** (and disable "Bot Fight Mode" for this request if that option is available on your plan).
4. Save and verify:
   ```bash
   curl -sA "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)" \
     https://www.elrincondeebano.com/ | grep -c 'cdn-cgi/challenge-platform'
   # must return 0
   npm run monitor:share-preview
   ```

This is a **recurring regression**: every time Cloudflare's security settings are reset (e.g., after a plan change, a zone re-import, or "Reset to Defaults") the bypass rule is lost and the bot challenge re-activates.
