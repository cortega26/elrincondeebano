function fail(message) {
  throw new Error(message);
}

export function escapeRegExp(input) {
  return String(input).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function assertAllowlistedHttpsUrl(parsed, label, options = {}) {
  const { allowedHosts = new Set(), rejectCredentials = false } = options;
  if (!(parsed instanceof URL)) {
    fail(`${label} must be a URL instance.`);
  }
  if (parsed.protocol !== 'https:') {
    fail(`${label} must use HTTPS: ${parsed.toString()}`);
  }
  if (rejectCredentials && (parsed.username || parsed.password)) {
    fail(`${label} must not include credentials: ${parsed.toString()}`);
  }
  if (!allowedHosts.has(parsed.hostname)) {
    fail(`${label} must target an allowlisted host: ${parsed.toString()}`);
  }
}

export function normalizeAllowlistedBaseUrl(rawBaseUrl, options = {}) {
  const {
    allowedHosts = new Set(),
    defaultBaseUrl = '',
    label = 'Base URL',
    rejectCredentials = false,
    requireValue = false,
  } = options;
  const candidate =
    typeof rawBaseUrl === 'string' && rawBaseUrl.trim() ? rawBaseUrl.trim() : defaultBaseUrl;
  if (!candidate) {
    if (requireValue) {
      fail('Missing required --base-url value.');
    }
    fail(`Invalid base URL: ${String(rawBaseUrl)}`);
  }

  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    fail(`Invalid base URL: ${String(rawBaseUrl)}`);
  }

  assertAllowlistedHttpsUrl(parsed, label, { allowedHosts, rejectCredentials });
  parsed.pathname = '';
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString().replace(/\/$/, '');
}

export function extractMetaContent(html, attributeName, attributeValue) {
  const escapedValue = escapeRegExp(attributeValue);
  const pattern = new RegExp(
    `<meta[^>]+${attributeName}=["']${escapedValue}["'][^>]+content=["']([^"]+)["']`,
    'i'
  );
  return String(html || '').match(pattern)?.[1] || null;
}

export function extractCanonicalHref(html) {
  return (
    String(html || '').match(/<link\s+rel=["']canonical["'][^>]*href=["']([^"]+)["']/i)?.[1] || null
  );
}

export function extractTitle(html) {
  return (
    String(html || '')
      .match(/<title>([^<]+)<\/title>/i)?.[1]
      ?.trim() || null
  );
}

export function looksLikeChallenge(html) {
  return /attention required|just a moment|cf-browser-verification|cdn-cgi\/challenge-platform|enable javascript and cookies/i.test(
    String(html || '')
  );
}

export function assertSupportedOgImageUrl(value, label) {
  const parsed = new URL(value);
  if (!/\.(?:jpe?g|png)$/i.test(parsed.pathname)) {
    fail(`${label} must use JPG or PNG for WhatsApp compatibility: ${value}`);
  }
}
