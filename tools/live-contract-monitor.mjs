import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import {
  inspectSecurityHeaders,
  SECURITY_HEADER_BASELINE_ROUTES,
  summarizeSecurityHeaderFailure,
} from './security-header-policy.mjs';

const DEFAULT_BASE_URL = 'https://www.elrincondeebano.com';
const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_SAMPLE_SIZE = 20;
const ALLOWED_PROBE_HOSTS = new Set(['www.elrincondeebano.com', 'elrincondeebano.com']);

const KEY_ROUTES = [
  '/',
  '/pages/bebidas.html',
  '/pages/vinos.html',
  '/pages/offline.html',
  '/robots.txt',
  '/sitemap.xml',
  '/404.html',
  '/service-worker.js',
  '/data/product_data.json',
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
  const candidate = typeof rawBaseUrl === 'string' && rawBaseUrl.trim() ? rawBaseUrl.trim() : DEFAULT_BASE_URL;
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
  const targetUrl = url instanceof URL ? new URL(url.toString()) : new URL(String(url));
  assertAllowedProbeUrl(targetUrl, 'Probe target');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(targetUrl, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'cache-control': 'no-cache',
      },
    });
    return response;
  } finally {
    clearTimeout(timer);
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

export async function checkUrl(baseUrl, routeOrPath, timeoutMs) {
  const target = resolveProbeUrl(baseUrl, routeOrPath);
  const targetUrl = target.toString();
  const shouldInspectSecurityHeaders = SECURITY_HEADER_BASELINE_ROUTES.includes(target.pathname);

  try {
    const response = await fetchWithTimeout(target, timeoutMs);
    return {
      url: targetUrl,
      status: response.status,
      ok: response.status === 200,
      finalUrl: response.url,
      server: response.headers.get('server') || '',
      cfRay: response.headers.get('cf-ray') || '',
      contentType: response.headers.get('content-type') || '',
      securityHeaders: shouldInspectSecurityHeaders ? inspectSecurityHeaders(response.headers) : null,
    };
  } catch (error) {
    return {
      url: targetUrl,
      status: 0,
      ok: false,
      finalUrl: '',
      server: '',
      cfRay: '',
      contentType: '',
      securityHeaders: null,
      error: error?.message || String(error),
    };
  }
}

function writeReport(reportPath, payload) {
  if (!reportPath) {
    return;
  }
  const resolvedPath = path.resolve(reportPath);
  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  fs.writeFileSync(resolvedPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

export async function runMonitor({
  baseUrl,
  timeoutMs,
  sampleSize,
  reportPath,
  requireSecurityHeaders = false,
}) {
  const startedAt = new Date().toISOString();
  const routeResults = [];

  for (const route of KEY_ROUTES) {
    routeResults.push(await checkUrl(baseUrl, route, timeoutMs));
  }

  const productDataResult = routeResults.find((result) => result.url.endsWith('/data/product_data.json'));
  const assetResults = [];
  let sampledAssets = [];

  if (productDataResult?.ok) {
    const productDataUrl = resolveProbeUrl(baseUrl, '/data/product_data.json');
    const productPayload = await (await fetchWithTimeout(productDataUrl, timeoutMs)).json();
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

    sampledAssets = Array.from(assetSet).sort().slice(0, sampleSize);
    for (const relativePath of sampledAssets) {
      assetResults.push(await checkUrl(baseUrl, `/${relativePath}`, timeoutMs));
    }
  }

  const availabilityFailures = [...routeResults, ...assetResults].filter((result) => !result.ok);
  const securityHeaderFailures = routeResults
    .filter((result) => result.securityHeaders && !result.securityHeaders.ok)
    .map(summarizeSecurityHeaderFailure);
  const success =
    availabilityFailures.length === 0 &&
    (!requireSecurityHeaders || securityHeaderFailures.length === 0);
  const report = {
    generatedAt: new Date().toISOString(),
    startedAt,
    baseUrl,
    timeoutMs,
    sampleSize,
    requireSecurityHeaders,
    keyRouteCount: routeResults.length,
    sampledAssetCount: sampledAssets.length,
    routeResults,
    assetResults,
    failures: availabilityFailures,
    securityHeaderBaselineRoutes: SECURITY_HEADER_BASELINE_ROUTES,
    securityHeaderFailures,
    availabilityOk: availabilityFailures.length === 0,
    securityHeadersOk: securityHeaderFailures.length === 0,
    success,
  };

  writeReport(reportPath, report);
  console.log(JSON.stringify(report, null, 2));

  if (availabilityFailures.length > 0) {
    throw new Error(`Live contract monitor found ${availabilityFailures.length} failing probe(s).`);
  }

  if (requireSecurityHeaders && securityHeaderFailures.length > 0) {
    throw new Error(
      `Live contract monitor found ${securityHeaderFailures.length} security header contract failure(s).`
    );
  }
}

async function runCli() {
  const { values } = parseArgs({
    options: {
      'base-url': { type: 'string' },
      'timeout-ms': { type: 'string' },
      'sample-size': { type: 'string' },
      report: { type: 'string' },
      'require-security-headers': { type: 'boolean' },
    },
    allowPositionals: false,
  });

  const baseUrl = normalizeBaseUrl(values['base-url']);
  const timeoutRaw = Number(values['timeout-ms']);
  const sampleRaw = Number(values['sample-size']);
  const timeoutMs = Number.isFinite(timeoutRaw) && timeoutRaw > 0 ? timeoutRaw : DEFAULT_TIMEOUT_MS;
  const sampleSize = Number.isFinite(sampleRaw) && sampleRaw > 0 ? sampleRaw : DEFAULT_SAMPLE_SIZE;

  await runMonitor({
    baseUrl,
    timeoutMs,
    sampleSize,
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
