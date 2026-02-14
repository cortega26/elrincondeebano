import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

const DEFAULT_BASE_URL = 'https://www.elrincondeebano.com';
const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_SAMPLE_SIZE = 20;

const KEY_ROUTES = [
  '/',
  '/pages/bebidas.html',
  '/pages/vinos.html',
  '/pages/e.html',
  '/pages/offline.html',
  '/robots.txt',
  '/sitemap.xml',
  '/404.html',
  '/service-worker.js',
  '/data/product_data.json',
];

const PRODUCT_ASSET_FIELDS = ['image_path', 'image_avif_path', 'thumbnail_path'];

function normalizeBaseUrl(raw) {
  const value = typeof raw === 'string' && raw.trim() ? raw.trim() : DEFAULT_BASE_URL;
  const parsed = new URL(value);
  if (parsed.protocol !== 'https:') {
    throw new Error(`Base URL must use HTTPS: ${value}`);
  }
  parsed.pathname = '';
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString().replace(/\/$/, '');
}

function normalizeAssetPath(raw) {
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
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
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

async function checkUrl(url, timeoutMs) {
  try {
    const response = await fetchWithTimeout(url, timeoutMs);
    return {
      url,
      status: response.status,
      ok: response.status === 200,
      finalUrl: response.url,
      server: response.headers.get('server') || '',
      cfRay: response.headers.get('cf-ray') || '',
      contentType: response.headers.get('content-type') || '',
    };
  } catch (error) {
    return {
      url,
      status: 0,
      ok: false,
      finalUrl: '',
      server: '',
      cfRay: '',
      contentType: '',
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

async function runMonitor({ baseUrl, timeoutMs, sampleSize, reportPath }) {
  const startedAt = new Date().toISOString();
  const routeResults = [];

  for (const route of KEY_ROUTES) {
    const url = `${baseUrl}${route}`;
    routeResults.push(await checkUrl(url, timeoutMs));
  }

  const productDataResult = routeResults.find((result) => result.url.endsWith('/data/product_data.json'));
  const assetResults = [];
  let sampledAssets = [];

  if (productDataResult?.ok) {
    const productPayload = await (await fetchWithTimeout(`${baseUrl}/data/product_data.json`, timeoutMs)).json();
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
      const url = `${baseUrl}/${relativePath}`;
      assetResults.push(await checkUrl(url, timeoutMs));
    }
  }

  const failures = [...routeResults, ...assetResults].filter((result) => !result.ok);
  const report = {
    generatedAt: new Date().toISOString(),
    startedAt,
    baseUrl,
    timeoutMs,
    sampleSize,
    keyRouteCount: routeResults.length,
    sampledAssetCount: sampledAssets.length,
    routeResults,
    assetResults,
    failures,
    success: failures.length === 0,
  };

  writeReport(reportPath, report);
  console.log(JSON.stringify(report, null, 2));

  if (failures.length > 0) {
    throw new Error(`Live contract monitor found ${failures.length} failing probe(s).`);
  }
}

async function runCli() {
  const { values } = parseArgs({
    options: {
      'base-url': { type: 'string' },
      'timeout-ms': { type: 'string' },
      'sample-size': { type: 'string' },
      report: { type: 'string' },
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
  });
}

runCli().catch((error) => {
  console.error(error?.message || String(error));
  process.exitCode = 1;
});
