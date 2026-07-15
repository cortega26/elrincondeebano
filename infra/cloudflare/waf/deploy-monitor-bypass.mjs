#!/usr/bin/env node
/**
 * Deploy a Cloudflare WAF "Skip" rule that lets the Live Contract Monitor clear
 * the managed challenge by presenting a secret header.
 *
 * The rule matches ONLY requests carrying the exact secret header, so the skip
 * applies to this monitor alone. It skips only challenge-issuing features
 * (Browser Integrity Check + Security Level) — never managed WAF rules, rate
 * limiting, IP/UA blocks, or the zone's block custom rules.
 *
 * Usage:
 *   CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ZONE_ID=... LIVE_MONITOR_BYPASS_TOKEN=... \
 *     node infra/cloudflare/waf/deploy-monitor-bypass.mjs
 *
 * CLOUDFLARE_API_TOKEN needs Zone · WAF · Edit. LIVE_MONITOR_BYPASS_TOKEN must
 * be the same value stored in the GitHub secret of the same name.
 *
 * NOTE: free Bot Fight Mode is NOT skippable by any rule. If the monitor is
 * still challenged after this rule, disable Bot Fight Mode in the dashboard.
 *
 * Dashboard alternative: Security → WAF → Custom rules → Create rule → Skip,
 *   expression: any(http.request.headers["x-live-monitor-token"][*] == "<TOKEN>")
 *   Skip components: Browser Integrity Check + Security Level.
 */
import { fileURLToPath, pathToFileURL } from 'node:url';

const CF_API = 'https://api.cloudflare.com/client/v4';
const PHASE = 'http_request_firewall_custom';
export const BYPASS_TOKEN_HEADER = 'x-live-monitor-token';
const RULE_DESCRIPTION =
  'Skip Cloudflare challenge for the Live Contract Monitor (secret-header gated).';

// Only challenge-issuing features. Product skips are position-independent, so
// the rule does not need to precede other custom rules.
const SKIP_PRODUCTS = ['bic', 'securityLevel'];

const HEX_ID_RE = /^[0-9a-f]{32}$/i;

export function buildExpression(token) {
  const value = String(token || '').trim();
  if (!value) {
    throw new Error('LIVE_MONITOR_BYPASS_TOKEN is required.');
  }
  if (/["\\]/.test(value)) {
    throw new Error('Token must not contain quotes or backslashes.');
  }
  // Header names are lower-cased in the Cloudflare Rules language.
  return `any(http.request.headers["${BYPASS_TOKEN_HEADER}"][*] == "${value}")`;
}

async function cfApi(path, options = {}) {
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  if (!apiToken) {
    throw new Error('CLOUDFLARE_API_TOKEN is required');
  }
  const res = await fetch(`${CF_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  const body = await res.json();
  if (!body.success) {
    throw new Error(`Cloudflare API error (${res.status}): ${JSON.stringify(body.errors || body)}`);
  }
  return body;
}

export async function upsertSkipRule(zoneId, token) {
  if (!HEX_ID_RE.test(String(zoneId))) {
    throw new Error(`Invalid CLOUDFLARE_ZONE_ID: ${zoneId}`);
  }
  const expression = buildExpression(token);
  const ruleset = (await cfApi(`/zones/${zoneId}/rulesets/phases/${PHASE}/entrypoint`)).result;
  const rulePayload = {
    action: 'skip',
    action_parameters: { products: SKIP_PRODUCTS },
    expression,
    description: RULE_DESCRIPTION,
    enabled: true,
  };
  const existing = (ruleset.rules || []).find((rule) => rule.description === RULE_DESCRIPTION);
  if (existing) {
    await cfApi(`/zones/${zoneId}/rulesets/${ruleset.id}/rules/${existing.id}`, {
      method: 'PATCH',
      body: JSON.stringify(rulePayload),
    });
    return { action: 'updated', id: existing.id };
  }
  await cfApi(`/zones/${zoneId}/rulesets/${ruleset.id}/rules`, {
    method: 'POST',
    body: JSON.stringify(rulePayload),
  });
  return { action: 'created' };
}

async function main() {
  const zoneId = process.env.CLOUDFLARE_ZONE_ID;
  const token = process.env.LIVE_MONITOR_BYPASS_TOKEN;
  if (!zoneId) {
    console.error('Set CLOUDFLARE_ZONE_ID (Cloudflare Dashboard → your zone → Overview).');
    process.exitCode = 1;
    return;
  }
  if (!token) {
    console.error('Set LIVE_MONITOR_BYPASS_TOKEN (same value as the GitHub secret).');
    process.exitCode = 1;
    return;
  }
  const result = await upsertSkipRule(zoneId, token);
  console.log(`✅ ${result.action} monitor skip rule${result.id ? ` ${result.id}` : ''}`);
  console.log(`   header: ${BYPASS_TOKEN_HEADER}`);
  console.log(`   skips (challenge-only): ${SKIP_PRODUCTS.join(', ')}`);
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
    console.error(err.message || err);
    process.exitCode = 1;
  });
}
