export const SECURITY_HEADER_BASELINE_ROUTES = Object.freeze(['/', '/pages/bebidas.html']);
const CSP_SELF = "'self'";
const CSP_NONE = "'none'";
const CSP_UNSAFE_INLINE = "'unsafe-inline'";

export const SECURITY_HEADER_POLICY = Object.freeze({
  'referrer-policy': 'strict-origin-when-cross-origin',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'permissions-policy':
    'accelerometer=(), autoplay=(), camera=(), display-capture=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=(), browsing-topics=()',
});

export const CONTENT_SECURITY_POLICY_DIRECTIVES = Object.freeze([
  ['default-src', [CSP_SELF]],
  ['base-uri', [CSP_SELF]],
  ['object-src', [CSP_NONE]],
  ['frame-ancestors', [CSP_NONE]],
  ['script-src', [CSP_SELF, 'https://static.cloudflareinsights.com', "'sha256-SvXHAIPcJdE6zuH0y1Xb0AUS/ZJCmBwN7SfMfiEj578='"]],
  ['style-src', [CSP_SELF, CSP_UNSAFE_INLINE]],
  ['img-src', [CSP_SELF, 'data:', 'https:']],
  ['font-src', [CSP_SELF, 'data:']],
  ['connect-src', [CSP_SELF, 'https://cloudflareinsights.com', 'https://static.cloudflareinsights.com']],
  ['manifest-src', [CSP_SELF]],
  ['worker-src', [CSP_SELF]],
  ['form-action', [CSP_SELF]],
  ['upgrade-insecure-requests', []],
]);

export const HTML_EDGE_SURFACE_RULES = Object.freeze([
  {
    id: 'third-party-jsdelivr-script',
    label: 'jsDelivr script reference',
    pattern: /<script\b[^>]*\bsrc=["'][^"']*cdn\.jsdelivr\.net/i,
    sanitizePattern:
      /<script\b[^>]*\bsrc=["'][^"']*cdn\.jsdelivr\.net[^"']*["'][^>]*>\s*<\/script>\s*/gi,
  },
  {
    id: 'cloudflare-rocket-loader',
    label: 'Cloudflare Rocket Loader',
    pattern: /rocket-loader\.min\.js/i,
    sanitizePattern:
      /<script\b[^>]*\bsrc=["'][^"']*rocket-loader\.min\.js[^"']*["'][^>]*>\s*<\/script>\s*/gi,
  },
  {
    id: 'cloudflare-challenge-platform',
    label: 'Cloudflare challenge platform',
    pattern: /\/cdn-cgi\/challenge-platform\//i,
    sanitizePattern:
      /<script\b[^>]*\bsrc=["'][^"']*\/cdn-cgi\/challenge-platform\/[^"']*["'][^>]*>\s*<\/script>\s*/gi,
  },
  {
    id: 'cloudflare-inline-insights-bootstrap',
    label: 'Cloudflare inline insights bootstrap',
    pattern:
      /<script\b(?![^>]*\bsrc=)[^>]*>[\s\S]*?(?:cloudflareinsights\.com|static\.cloudflareinsights\.com|data-cf-beacon)[\s\S]*?<\/script>/i,
    sanitizePattern:
      /<script\b(?![^>]*\bsrc=)(?![^>]*\btype=["']application\/(?:ld\+)?json["'])[^>]*>[\s\S]*?(?:__CF\$cv\$params|cloudflareinsights\.com|static\.cloudflareinsights\.com|data-cf-beacon|\/cdn-cgi\/challenge-platform\/)[\s\S]*?<\/script>\s*/gi,
  },
]);

function readHeader(headers, name) {
  if (!headers || typeof headers.get !== 'function') {
    return '';
  }
  return String(headers.get(name) || '').trim();
}

function normalizeHeaderValue(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizeTokenList(value) {
  return String(value || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .sort();
}

function parseContentSecurityPolicy(rawCsp) {
  const directives = new Map();

  for (const segment of String(rawCsp || '').split(';')) {
    const normalized = segment.trim();
    if (!normalized) {
      continue;
    }
    const [directive, ...values] = normalized.split(/\s+/);
    if (!directive) {
      continue;
    }
    directives.set(directive.toLowerCase(), values);
  }

  return directives;
}

export function buildContentSecurityPolicy() {
  return CONTENT_SECURITY_POLICY_DIRECTIVES.map(([directive, values]) =>
    values.length > 0 ? `${directive} ${values.join(' ')}` : directive
  ).join('; ');
}

export function buildSecurityHeadersPolicy() {
  return {
    'content-security-policy': buildContentSecurityPolicy(),
    ...SECURITY_HEADER_POLICY,
  };
}

export function inspectSecurityHeaders(headers) {
  const observed = {
    'content-security-policy': normalizeHeaderValue(readHeader(headers, 'content-security-policy')),
    'x-frame-options': readHeader(headers, 'x-frame-options'),
    'referrer-policy': readHeader(headers, 'referrer-policy'),
    'x-content-type-options': readHeader(headers, 'x-content-type-options'),
    'permissions-policy': readHeader(headers, 'permissions-policy'),
  };

  const missing = [];
  const invalid = [];
  const parsedCsp = parseContentSecurityPolicy(observed['content-security-policy']);

  if (!observed['content-security-policy']) {
    missing.push('content-security-policy');
  } else {
    for (const [directive, expectedValues] of CONTENT_SECURITY_POLICY_DIRECTIVES) {
      const actualValues = parsedCsp.get(directive);
      if (!actualValues) {
        invalid.push(`content-security-policy (${directive} missing)`);
        continue;
      }

      if (expectedValues.length === 0) {
        continue;
      }

      const expectedTokens = normalizeTokenList(expectedValues.join(' '));
      const actualTokens = normalizeTokenList(actualValues.join(' '));
      if (
        expectedTokens.length !== actualTokens.length ||
        expectedTokens.some((token, index) => token !== actualTokens[index])
      ) {
        invalid.push(
          `content-security-policy (${directive} expected "${expectedValues.join(' ')}")`
        );
      }
    }
  }

  if (!observed['referrer-policy']) {
    missing.push('referrer-policy');
  } else if (normalizeHeaderValue(observed['referrer-policy']) !== SECURITY_HEADER_POLICY['referrer-policy']) {
    invalid.push(`referrer-policy (expected ${SECURITY_HEADER_POLICY['referrer-policy']})`);
  }

  if (!observed['permissions-policy']) {
    missing.push('permissions-policy');
  } else if (
    normalizeHeaderValue(observed['permissions-policy']) !== SECURITY_HEADER_POLICY['permissions-policy']
  ) {
    invalid.push('permissions-policy (unexpected value)');
  }

  if (!observed['x-content-type-options']) {
    missing.push('x-content-type-options');
  } else if (
    normalizeHeaderValue(observed['x-content-type-options']).toLowerCase() !==
    SECURITY_HEADER_POLICY['x-content-type-options'].toLowerCase()
  ) {
    invalid.push(`x-content-type-options (expected ${SECURITY_HEADER_POLICY['x-content-type-options']})`);
  }

  if (!observed['x-frame-options']) {
    missing.push('x-frame-options');
  } else if (
    normalizeHeaderValue(observed['x-frame-options']).toUpperCase() !==
    SECURITY_HEADER_POLICY['x-frame-options']
  ) {
    invalid.push(`x-frame-options (expected ${SECURITY_HEADER_POLICY['x-frame-options']})`);
  }

  return {
    ok: missing.length === 0 && invalid.length === 0,
    observed,
    missing,
    invalid,
  };
}

export function summarizeSecurityHeaderFailure(routeResult) {
  return {
    url: routeResult.url,
    finalUrl: routeResult.finalUrl || '',
    missing: routeResult.securityHeaders?.missing || [],
    invalid: routeResult.securityHeaders?.invalid || [],
    observed: routeResult.securityHeaders?.observed || {},
  };
}

export function formatSecurityHeaderFailure(label, inspection) {
  const details = [...inspection.missing, ...inspection.invalid].join(', ');
  return `${label} is missing required security headers: ${details}`;
}

export function inspectPublicHtmlEdgeSurface(html) {
  const findings = [];

  for (const rule of HTML_EDGE_SURFACE_RULES) {
    if (rule.pattern.test(String(html || ''))) {
      findings.push(rule.label);
    }
  }

  return {
    ok: findings.length === 0,
    findings,
  };
}

export function sanitizePublicHtmlEdgeSurface(html) {
  const originalHtml = String(html || '');
  let sanitizedHtml = originalHtml;
  const findings = [];

  for (const rule of HTML_EDGE_SURFACE_RULES) {
    if (!(rule.sanitizePattern instanceof RegExp)) {
      continue;
    }

    const sanitizePattern = new RegExp(rule.sanitizePattern.source, rule.sanitizePattern.flags);
    if (!sanitizePattern.test(sanitizedHtml)) {
      continue;
    }

    findings.push(rule.label);
    sanitizedHtml = sanitizedHtml.replace(sanitizePattern, '');
  }

  return {
    ok: findings.length === 0,
    findings,
    changed: sanitizedHtml !== originalHtml,
    html: sanitizedHtml,
  };
}

export function summarizePublicHtmlFailure(routeResult) {
  return {
    url: routeResult.url,
    finalUrl: routeResult.finalUrl || '',
    findings: routeResult.htmlSurface?.findings || [],
  };
}

export function formatPublicHtmlFailure(label, inspection) {
  return `${label} includes disallowed HTML script surface: ${(inspection.findings || []).join(', ')}`;
}
