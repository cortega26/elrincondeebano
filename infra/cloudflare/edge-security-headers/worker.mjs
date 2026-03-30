import {
  buildSecurityHeadersPolicy,
  sanitizePublicHtmlEdgeSurface,
} from '../../../tools/security-header-policy.mjs';

const CANONICAL_HOST = 'www.elrincondeebano.com';
const HTML_CONTENT_TYPE_RE = /^\s*text\/html\b/i;

export function shouldApplySecurityHeaders({ request, response, canonicalHost = CANONICAL_HOST }) {
  const requestUrl = request instanceof Request ? new URL(request.url) : new URL(String(request));
  if (requestUrl.hostname !== canonicalHost) {
    return false;
  }

  const contentType = String(response.headers.get('content-type') || '');
  return HTML_CONTENT_TYPE_RE.test(contentType);
}

export function applySecurityHeaders(response, securityHeaders = buildSecurityHeadersPolicy()) {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(securityHeaders)) {
    headers.set(name, value);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export async function sanitizeHtmlResponse(response) {
  const body = await response.text();
  const sanitized = sanitizePublicHtmlEdgeSurface(body);
  const headers = new Headers(response.headers);

  if (sanitized.changed) {
    headers.delete('content-length');
  }

  return new Response(sanitized.html, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request) {
    const response = await fetch(request);
    if (!shouldApplySecurityHeaders({ request, response })) {
      return response;
    }

    return applySecurityHeaders(await sanitizeHtmlResponse(response));
  },
};
