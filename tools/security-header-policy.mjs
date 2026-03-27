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
  ['script-src', [CSP_SELF, 'https://cdn.jsdelivr.net']],
  ['style-src', [CSP_SELF, CSP_UNSAFE_INLINE, 'https://cdn.jsdelivr.net']],
  ['img-src', [CSP_SELF, 'data:', 'https:']],
  ['font-src', [CSP_SELF, 'data:', 'https://cdn.jsdelivr.net']],
  ['connect-src', [CSP_SELF]],
  ['manifest-src', [CSP_SELF]],
  ['worker-src', [CSP_SELF]],
  ['form-action', [CSP_SELF]],
  ['upgrade-insecure-requests', []],
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
