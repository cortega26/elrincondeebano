#!/usr/bin/env node
/**
 * Deploy WAF skip rules so known social-media crawlers can fetch
 * OG image previews without hitting a Cloudflare challenge.
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
 *   3. Rule name: "Skip WAF for social crawlers on OG images"
 *   4. Field: URI Path  →  equals  →  /assets/images/og/*
 *   5. AND  User Agent  →  contains any of:
 *        WhatsApp, facebookexternalhit, Twitterbot, TelegramBot,
 *        LinkedInBot, Discordbot, Slackbot-LinkExpanding
 *   6. Action: "Skip" → tick "All remaining custom rules"
 *   7. Save
 */

const CF_API = 'https://api.cloudflare.com/client/v4';

const CRAWLER_PATTERNS = [
  'WhatsApp',
  'facebookexternalhit',
  'Twitterbot',
  'TelegramBot',
  'LinkedInBot',
  'Discordbot',
  'Slackbot-LinkExpanding',
  'Google-Site-Verification',
];

function buildExpression() {
  const uaClauses = CRAWLER_PATTERNS.map((p) => `(http.user_agent contains "${p}")`);
  return [
    `(starts_with(http.request.uri.path, "/assets/images/og/"))`,
    `and`,
    `(${uaClauses.join(' or ')})`,
  ].join(' ');
}

async function cfApi(path, options = {}) {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) {
    throw new Error('CLOUDFLARE_API_TOKEN is required');
  }
  const url = `${CF_API}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
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
  const ruleName = 'Skip WAF for social crawlers on OG images';
  const description = [
    'Allows WhatsApp, Facebook, Twitter, Telegram, LinkedIn,',
    'Discord, and Slack crawlers to fetch OG image previews',
    'without Cloudflare WAF challenges.',
  ].join(' ');

  // Look for an existing rule to update
  const existing = (ruleset.rules || []).find((r) => r.description === description);

  const rulePayload = {
    action: 'skip',
    action_parameters: {
      ruleset: 'current',
      rules: 'all',
    },
    expression,
    description,
    enabled: true,
    name: ruleName,
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
    '  curl -I -H "User-Agent: WhatsApp/2.0" https://www.elrincondeebano.com/assets/images/og/home.og.jpg'
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
