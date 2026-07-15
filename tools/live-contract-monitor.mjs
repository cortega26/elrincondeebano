import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import {
  inspectPublicHtmlEdgeSurface,
  inspectSecurityHeaders,
  SECURITY_HEADER_BASELINE_ROUTES,
  summarizePublicHtmlFailure,
  summarizeSecurityHeaderFailure,
} from './security-header-policy.mjs';
import { parseOptionalIntegerOption, writeJsonReport } from './utils/cli.mjs';

const DEFAULT_BASE_URL = 'https://www.elrincondeebano.com';
const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_SAMPLE_SIZE = 20;
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAY_MS = 750;
const FAILURE_SNIPPET_MAX_LENGTH = 220;
const PRODUCT_DATA_ROUTE = '/data/product_data.json';
const ALLOWED_PROBE_HOSTS = new Set(['www.elrincondeebano.com', 'elrincondeebano.com']);
const PROBE_REQUEST_HEADERS = Object.freeze({
  accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,text/plain;q=0.7,*/*;q=0.5',
  'accept-language': 'en-US,en;q=0.9',
  'cache-control': 'no-cache',
  pragma: 'no-cache',
  'sec-fetch-dest': 'document',
  'sec-fetch-mode': 'navigate',
  'sec-fetch-site': 'none',
  'sec-fetch-user': '?1',
  'upgrade-insecure-requests': '1',
  'user-agent':
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
});

const KEY_ROUTES = [
  '/',
  '/pages/bebidas.html',
  '/pages/vinos.html',
  '/pages/offline.html',
  '/robots.txt',
  '/sitemap.xml',
  '/404.html',
  '/service-worker.js',
  PRODUCT_DATA_ROUTE,
];

const PRODUCT_ASSET_FIELDS = ['image_path', 'image_avif_path', 'thumbnail_path'];

function assertAllowedProbeUrl(parsed, label) {
  if (!(parsed instanceof URL)) {
    throw new Error(`${label} must be a URL instance.`);
  }
  if (parsed.protocol !== 'https:') {
    throw new Error(`${label} must use HTTPS: ${parsed.toString()}`);
  }
  if (parsed.username || parsed.password) {
    throw new Error(`${label} must not include credentials: ${parsed.toString()}`);
  }
  if (!ALLOWED_PROBE_HOSTS.has(parsed.hostname)) {
    throw new Error(`${label} must target an allowlisted host: ${parsed.toString()}`);
  }
}

export function normalizeBaseUrl(rawBaseUrl = DEFAULT_BASE_URL) {
  const candidate =
    typeof rawBaseUrl === 'string' && rawBaseUrl.trim() ? rawBaseUrl.trim() : DEFAULT_BASE_URL;
  const parsed = new URL(candidate);
  assertAllowedProbeUrl(parsed, 'Base URL');
  parsed.pathname = '';
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString().replace(/\/$/, '');
}

export function normalizeAssetPath(raw) {
  if (typeof raw !== 'string') {
    return null;
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  const normalized = trimmed.replace(/^\/+/, '');
  if (!normalized.startsWith('assets/')) {
    return null;
  }
  if (normalized.split('/').some((part) => part === '..')) {
    throw new Error(`Invalid asset path traversal: ${raw}`);
  }
  return normalized;
}

async function fetchWithTimeout(url, timeoutMs) {
  if (!(url instanceof URL)) {
    throw new Error('URL must be a URL instance');
  }
  assertAllowedProbeUrl(url, 'Probe target');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: PROBE_REQUEST_HEADERS,
    });
    return response;
  } finally {
    clearTimeout(timer);
  }
}

function sleep(ms) {
  if (!Number.isFinite(ms) || ms <= 0) {
    return Promise.resolve();
  }
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeBodySnippet(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, FAILURE_SNIPPET_MAX_LENGTH);
}

async function readFailureBodySnippet(response) {
  if (!(response instanceof Response)) {
    return '';
  }

  try {
    return normalizeBodySnippet(await response.clone().text());
  } catch {
    return '';
  }
}

function looksLikeCloudflareChallenge(bodySnippet) {
  return /attention required|just a moment|cf-browser-verification|cdn-cgi\/challenge-platform|enable javascript and cookies/i.test(
    String(bodySnippet || '')
  );
}

function isCloudflareChallengeResponse(result) {
  return (
    String(result?.cfMitigated || '').toLowerCase() === 'challenge' ||
    looksLikeCloudflareChallenge(result?.bodySnippet)
  );
}

function classifyRetryableFailure(result) {
  if (!result || result.ok) {
    return '';
  }

  if (result.status === 0 && result.error) {
    return 'network or timeout error';
  }

  if (result.status === 429) {
    return 'rate limited by edge or origin';
  }

  if ([500, 502, 503, 504].includes(result.status)) {
    return 'transient upstream or edge error';
  }

  if (result.status === 403 && isCloudflareChallengeResponse(result)) {
    return 'Cloudflare-managed challenge';
  }

  return '';
}

async function executeProbe(
  target,
  timeoutMs,
  shouldInspectSecurityHeaders,
  shouldInspectHtmlSurface
) {
  try {
    const response = await fetchWithTimeout(target, timeoutMs);
    const contentType = response.headers.get('content-type') || '';
    const result = {
      status: response.status,
      ok: response.status === 200,
      finalUrl: response.url,
      server: response.headers.get('server') || '',
      cfRay: response.headers.get('cf-ray') || '',
      cfMitigated: response.headers.get('cf-mitigated') || '',
      contentType,
      bodySnippet: '',
      securityHeaders:
        response.status === 200 && shouldInspectSecurityHeaders
          ? inspectSecurityHeaders(response.headers)
          : null,
      htmlSurface: null,
      error: '',
    };

    if (result.ok && shouldInspectHtmlSurface && /^\s*text\/html\b/i.test(contentType)) {
      const html = await response.clone().text();
      result.htmlSurface = inspectPublicHtmlEdgeSurface(html);
    }

    if (!result.ok) {
      result.bodySnippet = await readFailureBodySnippet(response);
    }

    return result;
  } catch (error) {
    return {
      status: 0,
      ok: false,
      finalUrl: '',
      server: '',
      cfRay: '',
      cfMitigated: '',
      contentType: '',
      bodySnippet: '',
      securityHeaders: null,
      error: error?.message || String(error),
    };
  }
}

export function resolveProbeUrl(baseUrl, routeOrPath) {
  if (typeof routeOrPath !== 'string' || !routeOrPath.trim()) {
    throw new Error('Probe path must be a non-empty string.');
  }

  const normalized = routeOrPath.trim();
  if (/^https?:\/\//i.test(normalized)) {
    throw new Error(`Absolute URLs are not allowed in probes: ${normalized}`);
  }
  if (normalized.split('/').some((segment) => segment === '..')) {
    throw new Error(`Path traversal is not allowed in probes: ${normalized}`);
  }

  const base = new URL(`${baseUrl}/`);
  assertAllowedProbeUrl(base, 'Base URL');
  const candidate = new URL(normalized.startsWith('/') ? normalized : `/${normalized}`, base);
  if (candidate.origin !== base.origin) {
    throw new Error(`Cross-origin probe blocked: ${candidate.toString()}`);
  }

  return candidate;
}

export async function checkUrl(baseUrl, routeOrPath, timeoutMs, options = {}) {
  const target = resolveProbeUrl(baseUrl, routeOrPath);
  const targetUrl = target.toString();
  const shouldInspectSecurityHeaders = SECURITY_HEADER_BASELINE_ROUTES.includes(target.pathname);
  const shouldInspectHtmlSurface = SECURITY_HEADER_BASELINE_ROUTES.includes(target.pathname);
  const maxAttempts =
    Number.isFinite(options.maxAttempts) && options.maxAttempts > 0
      ? Math.floor(options.maxAttempts)
      : DEFAULT_MAX_ATTEMPTS;
  const retryDelayMs =
    Number.isFinite(options.retryDelayMs) && options.retryDelayMs >= 0
      ? Math.floor(options.retryDelayMs)
      : DEFAULT_RETRY_DELAY_MS;
  const attempts = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const probeResult = await executeProbe(
      target,
      timeoutMs,
      shouldInspectSecurityHeaders,
      shouldInspectHtmlSurface
    );
    const retryReason = classifyRetryableFailure(probeResult);
    attempts.push({
      attempt,
      status: probeResult.status,
      ok: probeResult.ok,
      server: probeResult.server,
      cfRay: probeResult.cfRay,
      contentType: probeResult.contentType,
      error: probeResult.error,
      bodySnippet: probeResult.bodySnippet,
      cfMitigated: probeResult.cfMitigated,
      retryReason,
    });

    if (probeResult.ok || !retryReason || attempt === maxAttempts) {
      return {
        url: targetUrl,
        ...probeResult,
        attemptCount: attempts.length,
        retried: attempts.length > 1,
        retryReason,
        observerBlocked: isCloudflareChallengeResponse(probeResult),
        retryHistory: attempts,
      };
    }

    await sleep(retryDelayMs * attempt);
  }
}

export async function runMonitor({
  baseUrl,
  timeoutMs,
  sampleSize,
  reportPath,
  requireSecurityHeaders = false,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
  retryDelayMs = DEFAULT_RETRY_DELAY_MS,
}) {
  const normalizedTimeoutMs = parseOptionalIntegerOption(timeoutMs, {
    name: 'timeoutMs',
    defaultValue: DEFAULT_TIMEOUT_MS,
    minimum: 1,
  });
  const normalizedSampleSize = parseOptionalIntegerOption(sampleSize, {
    name: 'sampleSize',
    defaultValue: DEFAULT_SAMPLE_SIZE,
    minimum: 1,
  });
  const normalizedMaxAttempts = parseOptionalIntegerOption(maxAttempts, {
    name: 'maxAttempts',
    defaultValue: DEFAULT_MAX_ATTEMPTS,
    minimum: 1,
  });
  const normalizedRetryDelayMs = parseOptionalIntegerOption(retryDelayMs, {
    name: 'retryDelayMs',
    defaultValue: DEFAULT_RETRY_DELAY_MS,
    minimum: 0,
  });
  const startedAt = new Date().toISOString();
  const routeResults = [];

  for (const route of KEY_ROUTES) {
    routeResults.push(
      await checkUrl(baseUrl, route, normalizedTimeoutMs, {
        maxAttempts: normalizedMaxAttempts,
        retryDelayMs: normalizedRetryDelayMs,
      })
    );
  }

  const productDataResult = routeResults.find((result) => result.url.endsWith(PRODUCT_DATA_ROUTE));
  const assetResults = [];
  let sampledAssets = [];

  if (productDataResult?.ok) {
    const productDataUrl = resolveProbeUrl(baseUrl, PRODUCT_DATA_ROUTE);
    const productPayload = await (
      await fetchWithTimeout(productDataUrl, normalizedTimeoutMs)
    ).json();
    const products = Array.isArray(productPayload?.products) ? productPayload.products : [];
    const assetSet = new Set();

    for (const product of products) {
      for (const field of PRODUCT_ASSET_FIELDS) {
        const normalized = normalizeAssetPath(product?.[field]);
        if (normalized) {
          assetSet.add(normalized);
        }
      }
    }

    sampledAssets = Array.from(assetSet).sort().slice(0, normalizedSampleSize);
    for (const relativePath of sampledAssets) {
      assetResults.push(
        await checkUrl(baseUrl, `/${relativePath}`, normalizedTimeoutMs, {
          maxAttempts: normalizedMaxAttempts,
          retryDelayMs: normalizedRetryDelayMs,
        })
      );
    }
  }

  const availabilityFailures = [...routeResults, ...assetResults].filter((result) => !result.ok);
  const observerBlockedFailures = availabilityFailures.filter((result) => result.observerBlocked);
  const confirmedAvailabilityFailures = availabilityFailures.filter(
    (result) => !result.observerBlocked
  );
  const securityHeaderFailures = routeResults
    .filter((result) => result.securityHeaders && !result.securityHeaders.ok)
    .map(summarizeSecurityHeaderFailure);
  const htmlSurfaceFailures = routeResults
    .filter((result) => result.htmlSurface && !result.htmlSurface.ok)
    .map(summarizePublicHtmlFailure);
  const hasConfirmedFailure =
    confirmedAvailabilityFailures.length > 0 ||
    htmlSurfaceFailures.length > 0 ||
    (requireSecurityHeaders && securityHeaderFailures.length > 0);
  const monitorStatus = hasConfirmedFailure
    ? 'failed'
    : observerBlockedFailures.length > 0
      ? 'inconclusive'
      : 'passed';
  const success = monitorStatus === 'passed';
  const report = {
    generatedAt: new Date().toISOString(),
    startedAt,
    baseUrl,
    timeoutMs: normalizedTimeoutMs,
    sampleSize: normalizedSampleSize,
    requireSecurityHeaders,
    maxAttempts: normalizedMaxAttempts,
    retryDelayMs: normalizedRetryDelayMs,
    keyRouteCount: routeResults.length,
    sampledAssetCount: sampledAssets.length,
    routeResults,
    assetResults,
    failures: availabilityFailures,
    confirmedAvailabilityFailures,
    observerBlockedFailures,
    securityHeaderBaselineRoutes: SECURITY_HEADER_BASELINE_ROUTES,
    securityHeaderFailures,
    htmlSurfaceBaselineRoutes: SECURITY_HEADER_BASELINE_ROUTES,
    htmlSurfaceFailures,
    availabilityOk: availabilityFailures.length === 0,
    securityHeadersOk: securityHeaderFailures.length === 0,
    htmlSurfaceOk: htmlSurfaceFailures.length === 0,
    conclusive: monitorStatus !== 'inconclusive',
    monitorStatus,
    success,
  };

  writeJsonReport(reportPath, report);
  console.log(JSON.stringify(report, null, 2));

  if (confirmedAvailabilityFailures.length > 0) {
    throw new Error(
      `Live contract monitor found ${confirmedAvailabilityFailures.length} confirmed failing probe(s).`
    );
  }

  if (requireSecurityHeaders && securityHeaderFailures.length > 0) {
    throw new Error(
      `Live contract monitor found ${securityHeaderFailures.length} security header contract failure(s).`
    );
  }

  if (htmlSurfaceFailures.length > 0) {
    throw new Error(
      `Live contract monitor found ${htmlSurfaceFailures.length} disallowed HTML surface failure(s).`
    );
  }
}

async function runCli() {
  const { values } = parseArgs({
    options: {
      'base-url': { type: 'string' },
      'timeout-ms': { type: 'string' },
      'sample-size': { type: 'string' },
      'max-attempts': { type: 'string' },
      'retry-delay-ms': { type: 'string' },
      report: { type: 'string' },
      'require-security-headers': { type: 'boolean' },
    },
    allowPositionals: false,
  });

  const baseUrl = normalizeBaseUrl(values['base-url']);
  const timeoutMs = parseOptionalIntegerOption(values['timeout-ms'], {
    name: '--timeout-ms',
    defaultValue: DEFAULT_TIMEOUT_MS,
    minimum: 1,
  });
  const sampleSize = parseOptionalIntegerOption(values['sample-size'], {
    name: '--sample-size',
    defaultValue: DEFAULT_SAMPLE_SIZE,
    minimum: 1,
  });
  const maxAttempts = parseOptionalIntegerOption(values['max-attempts'], {
    name: '--max-attempts',
    defaultValue: DEFAULT_MAX_ATTEMPTS,
    minimum: 1,
  });
  const retryDelayMs = parseOptionalIntegerOption(values['retry-delay-ms'], {
    name: '--retry-delay-ms',
    defaultValue: DEFAULT_RETRY_DELAY_MS,
    minimum: 0,
  });

  await runMonitor({
    baseUrl,
    timeoutMs,
    sampleSize,
    maxAttempts,
    retryDelayMs,
    reportPath: values.report || '',
    requireSecurityHeaders: values['require-security-headers'] === true,
  });
}

const isDirectRun = process.argv[1] === fileURLToPath(import.meta.url);
if (isDirectRun) {
  runCli().catch((error) => {
    console.error(error?.message || String(error));
    process.exitCode = 1;
  });
}
