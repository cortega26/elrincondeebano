#!/usr/bin/env node
/**
 * Deploy WAF skip rules so known social-media crawlers can fetch
 * share-preview HTML routes and OG assets without hitting a Cloudflare challenge.
 *
 * Usage:
 *   CLOUDFLARE_API_TOKEN=xxx CLOUDFLARE_ZONE_ID=xxx node deploy-crawler-bypass.mjs
 *
 * The CLOUDFLARE_API_TOKEN needs Zone / WAF / Edit permission.
 * (Wrangler's token usually doesn't have it – see README below.)
 *
 * ── Dashboard alternative ──────────────────────────────────────────
 * Skip the script entirely and create the rule by hand:
 *   1. Cloudflare Dashboard → your zone → Security → WAF → Custom rules
 *   2. "Create rule" → "Skip"
 *   3. Rule name: "Skip WAF for social crawlers on share-preview routes"
 *   4. Route scope:
 *      - homepage: /
 *      - top-level share-preview pages: /<slug>/
 *      - product pages: /p/<sku>/
 *      - OG assets: /assets/images/og/*
 *   5. AND  User Agent  →  contains any of:
 *        WhatsApp, facebookexternalhit, Twitterbot, TelegramBot,
 *        LinkedInBot, Discordbot, Slackbot-LinkExpanding
 *   6. Action: "Skip" → tick "All remaining custom rules"
 *   7. Save
 */

import { fileURLToPath, pathToFileURL } from 'node:url';

const CF_API = 'https://api.cloudflare.com/client/v4';
const SHARE_PREVIEW_ASSET_PREFIX = '/assets/images/og/';
const SHARE_PREVIEW_HTML_ROUTE_PATTERN = '^/(?:$|p/[^/]+/?$|[^./]+/?$)';
const CLOUDFLARE_API_PATH_PREFIX = '/client/v4/zones/';
const RULE_NAME = 'Skip WAF for social crawlers on share-preview routes';
const RULE_DESCRIPTION = [
  'Allows social crawlers to fetch supported share-preview HTML routes',
  'and OG image assets without Cloudflare WAF challenges.',
].join(' ');

export const CRAWLER_PATTERNS = [
  'WhatsApp',
  'facebookexternalhit',
  'Twitterbot',
  'TelegramBot',
  'LinkedInBot',
  'Discordbot',
  'Slackbot-LinkExpanding',
  'Google-Site-Verification',
];

export function buildUserAgentExpression() {
  const uaClauses = CRAWLER_PATTERNS.map((p) => `(http.user_agent contains "${p}")`);
  return `(${uaClauses.join(' or ')})`;
}

export function buildPathExpression() {
  return [
    `(`,
    `(starts_with(http.request.uri.path, "${SHARE_PREVIEW_ASSET_PREFIX}"))`,
    `or`,
    `(http.request.uri.path matches "${SHARE_PREVIEW_HTML_ROUTE_PATTERN}")`,
    `)`,
  ].join(' ');
}

export function buildExpression() {
  return [buildPathExpression(), 'and', buildUserAgentExpression()].join(' ');
}

export function buildCloudflareApiUrl(apiPath) {
  const normalizedApiPath = String(apiPath || '').trim();
  if (!normalizedApiPath.startsWith('/')) {
    throw new Error(`Cloudflare API path must be absolute: ${normalizedApiPath}`);
  }
  if (normalizedApiPath.includes('://') || normalizedApiPath.includes('..')) {
    throw new Error(
      `Cloudflare API path must stay relative to the fixed API origin: ${normalizedApiPath}`
    );
  }
  if (!normalizedApiPath.startsWith(CLOUDFLARE_API_PATH_PREFIX)) {
    throw new Error(
      `Cloudflare API path must stay under ${CLOUDFLARE_API_PATH_PREFIX}: ${normalizedApiPath}`
    );
  }

  const url = new URL(normalizedApiPath, CF_API);
  if (url.origin !== CF_API) {
    throw new Error(`Cloudflare API URL must stay on ${CF_API}: ${url.toString()}`);
  }

  return url;
}

async function cfApi(path, options = {}) {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) {
    throw new Error('CLOUDFLARE_API_TOKEN is required');
  }
  const url = buildCloudflareApiUrl(path);
  const requestUrl = url.toString();
  const allowedUrls = new Set([requestUrl]);
  const isAllowedRequestUrl = allowedUrls.has(requestUrl);
  if (!isAllowedRequestUrl) {
    throw new Error(`Cloudflare API URL is not allowlisted: ${requestUrl}`);
  }

  const res = await (async () => {
    if (allowedUrls.has(requestUrl)) {
      return fetch(requestUrl, {
        ...options,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });
    }

    throw new Error(`Cloudflare API URL is not allowlisted: ${requestUrl}`);
  })();
  const body = await res.json();
  if (!body.success) {
    throw new Error(`Cloudflare API error: ${JSON.stringify(body.errors || body)}`);
  }
  return body;
}

async function getOrCreateSkipRuleset(zoneId) {
  // Phase for custom-firewall rules
  const phase = 'http_request_firewall_custom';
  let result = await cfApi(`/zones/${zoneId}/rulesets/phases/${phase}/entrypoint`);

  if (!result.result) {
    // No ruleset exists yet – create one
    result = await cfApi(`/zones/${zoneId}/rulesets`, {
      method: 'POST',
      body: JSON.stringify({
        name: 'Custom firewall rules',
        kind: 'zone',
        phase,
        rules: [],
      }),
    });
  }

  return result.result;
}

async function upsertSkipRule(zoneId) {
  const ruleset = await getOrCreateSkipRuleset(zoneId);
  const rulesetId = ruleset.id;
  const expression = buildExpression();

  // Look for an existing rule to update
  const existing = (ruleset.rules || []).find((r) => r.description === RULE_DESCRIPTION);

  const rulePayload = {
    action: 'skip',
    action_parameters: {
      ruleset: 'current',
      rules: 'all',
    },
    expression,
    description: RULE_DESCRIPTION,
    enabled: true,
    name: RULE_NAME,
  };

  if (existing) {
    await cfApi(`/zones/${zoneId}/rulesets/${rulesetId}/rules/${existing.id}`, {
      method: 'PATCH',
      body: JSON.stringify(rulePayload),
    });
    console.log(`✅ Updated existing rule: ${existing.id}`);
  } else {
    await cfApi(`/zones/${zoneId}/rulesets/${rulesetId}/rules`, {
      method: 'POST',
      body: JSON.stringify(rulePayload),
    });
    console.log('✅ Created new WAF skip rule');
  }

  console.log(`   Expression: ${expression}`);
  console.log(`   Crawlers (${CRAWLER_PATTERNS.length}): ${CRAWLER_PATTERNS.join(', ')}`);
}

async function main() {
  const zoneId = process.env.CLOUDFLARE_ZONE_ID;
  if (!zoneId) {
    console.error(
      'Set CLOUDFLARE_ZONE_ID (find it in Cloudflare Dashboard → your zone → Overview → Zone ID)'
    );
    process.exitCode = 1;
    return;
  }

  await upsertSkipRule(zoneId);
  console.log('\nDeployed. Test with:');
  console.log(
    '  curl -sA "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)" https://www.elrincondeebano.com/ | rg -n "canonical|og:|twitter:|description|challenge-platform"'
  );
  console.log(
    '  curl -I -H "User-Agent: WhatsApp/2.0" https://www.elrincondeebano.com/assets/images/og/home.og.jpg'
  );
}

function isDirectExecution(metaUrl = import.meta.url) {
  if (!process.argv[1]) {
    return false;
  }

  return (
    metaUrl === pathToFileURL(process.argv[1]).href || fileURLToPath(metaUrl) === process.argv[1]
  );
}

if (isDirectExecution()) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
