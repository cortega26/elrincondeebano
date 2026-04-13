import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import {
  assertAllowlistedHttpsUrl,
  assertSupportedOgImageUrl as assertSupportedOgImageUrlContract,
  extractMetaContent as extractMetaContentContract,
  normalizeAllowlistedBaseUrl,
} from './share-preview-contract.mjs';
import {
  formatPublicHtmlFailure,
  inspectPublicHtmlEdgeSurface,
  formatSecurityHeaderFailure,
  inspectSecurityHeaders,
} from './security-header-policy.mjs';

const ALLOWED_CANARY_HOSTS = new Set(['www.elrincondeebano.com', 'elrincondeebano.com']);

function fail(message) {
  throw new Error(message);
}

function assertAllowedCanaryUrl(parsed, label) {
  assertAllowlistedHttpsUrl(parsed, label, {
    allowedHosts: ALLOWED_CANARY_HOSTS,
    rejectCredentials: true,
  });
}

export function normalizeBaseUrl(raw) {
  return normalizeAllowlistedBaseUrl(raw, {
    allowedHosts: ALLOWED_CANARY_HOSTS,
    label: 'Base URL',
    rejectCredentials: true,
    requireValue: true,
  });
}

export function normalizePathname(pathname) {
  const value = String(pathname || '').trim();
  if (!value) {
    return '/';
  }
  return value.startsWith('/') ? value : `/${value}`;
}

export function extractMetaContent(html, attribute, key) {
  return extractMetaContentContract(html, attribute, key);
}

export function assertOgContract(html, pageLabel) {
  const required = [
    ['property', 'og:image'],
    ['property', 'og:image:width'],
    ['property', 'og:image:height'],
    ['property', 'og:url'],
  ];
  for (const [attr, key] of required) {
    const content = extractMetaContent(html, attr, key);
    if (!content) {
      fail(`${pageLabel} is missing meta tag: ${key}`);
    }
  }
}

export function extractCategoryPathFromSitemap(xml) {
  const regex = /<loc>\s*https:\/\/[^<]+(\/[a-z0-9_-]+\/)\s*<\/loc>/gi;
  const matches = [];
  let match = regex.exec(xml);
  while (match) {
    matches.push(match[1]);
    match = regex.exec(xml);
  }
  return matches.sort()[0] || null;
}

function ensureAbsoluteSameOriginHttpsUrl(value, label, baseUrl) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail(`${label} must be an absolute URL: ${value}`);
  }
  assertAllowedCanaryUrl(parsed, label);

  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  if (parsed.origin !== normalizedBaseUrl) {
    fail(`${label} must stay on the canary origin: ${parsed.toString()}`);
  }
  return parsed.toString();
}

export function assertSupportedOgImageUrl(value, label) {
  return assertSupportedOgImageUrlContract(value, label);
}

function normalizeFetchTarget(rawUrl, baseUrl, label = 'Fetch target') {
  let parsed;
  try {
    parsed = rawUrl instanceof URL ? new URL(rawUrl.toString()) : new URL(String(rawUrl));
  } catch {
    fail(`Fetch target must be an absolute URL: ${String(rawUrl)}`);
  }
  assertAllowedCanaryUrl(parsed, label);

  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  if (parsed.origin !== normalizedBaseUrl) {
    fail(`${label} must stay on the canary origin: ${parsed.toString()}`);
  }
  return parsed;
}

async function fetchWithTimeout(rawUrl, baseUrl, timeoutMs, label) {
  const targetUrl = normalizeFetchTarget(rawUrl, baseUrl, label);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(targetUrl, {
      signal: controller.signal,
      headers: {
        'cache-control': 'no-cache',
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

async function assertHttpOk(baseUrl, url, label, timeoutMs) {
  const response = await fetchWithTimeout(url, baseUrl, timeoutMs, label);
  if (!response.ok) {
    let snippet;
    try {
      const body = await response.clone().text();
      snippet = body.slice(0, 220).replace(/\s+/g, ' ').trim();
    } catch {
      snippet = '<unavailable>';
    }
    const server = response.headers.get('server') || '<none>';
    const cfRay = response.headers.get('cf-ray') || '<none>';
    const contentType = response.headers.get('content-type') || '<none>';
    fail(
      `${label} returned ${response.status} for ${url} ` +
        `(server=${server}, cf-ray=${cfRay}, content-type=${contentType}, body="${snippet}")`
    );
  }
  return response;
}

async function probeSecurityHeaders({
  baseUrl,
  url,
  label,
  timeoutMs,
  requireSecurityHeaders = false,
}) {
  const response = await assertHttpOk(baseUrl, url, label, timeoutMs);
  const securityHeaders = inspectSecurityHeaders(response.headers);
  const htmlSurface = inspectPublicHtmlEdgeSurface(await response.clone().text());
  if (requireSecurityHeaders && !securityHeaders.ok) {
    fail(formatSecurityHeaderFailure(label, securityHeaders));
  }
  if (!htmlSurface.ok) {
    fail(formatPublicHtmlFailure(label, htmlSurface));
  }

  return {
    url,
    finalUrl: response.url,
    status: securityHeaders.ok ? 'pass' : 'warn',
    securityHeaders,
    htmlSurface,
  };
}

function ensureWhatsAppPresence(html, pageLabel) {
  const hasWhatsapp =
    /wa\.me\//i.test(html) || /api\.whatsapp\.com\/send/i.test(html) || /whatsapp/i.test(html);
  if (!hasWhatsapp) {
    fail(`${pageLabel} does not appear to include WhatsApp flow references.`);
  }
}

async function verifyPage({ baseUrl, url, label, timeoutMs, ensureWhatsapp = false }) {
  const response = await assertHttpOk(baseUrl, url, label, timeoutMs);
  const html = await response.text();
  const htmlSurface = inspectPublicHtmlEdgeSurface(html);
  if (!htmlSurface.ok) {
    fail(formatPublicHtmlFailure(label, htmlSurface));
  }
  assertOgContract(html, label);
  const ogImage = extractMetaContent(html, 'property', 'og:image');
  const absoluteOgImage = ensureAbsoluteSameOriginHttpsUrl(ogImage, `${label} og:image`, baseUrl);
  assertSupportedOgImageUrl(absoluteOgImage, `${label} og:image`);
  const width = extractMetaContent(html, 'property', 'og:image:width');
  const height = extractMetaContent(html, 'property', 'og:image:height');
  if (!/^\d+$/.test(width || '')) {
    fail(`${label} has invalid og:image:width (${String(width)})`);
  }
  if (!/^\d+$/.test(height || '')) {
    fail(`${label} has invalid og:image:height (${String(height)})`);
  }
  if (ensureWhatsapp) {
    ensureWhatsAppPresence(html, label);
  }

  const imageResponse = await assertHttpOk(
    baseUrl,
    absoluteOgImage,
    `${label} og:image`,
    timeoutMs
  );
  const contentType = imageResponse.headers.get('content-type') || '';
  if (!/^image\/(?:jpeg|png)\b/i.test(contentType)) {
    fail(`${label} og:image returned unsupported content type for WhatsApp: ${contentType}`);
  }

  return {
    url,
    htmlSurface,
    ogImage: absoluteOgImage,
    width: Number(width),
    height: Number(height),
    imageContentType: contentType,
  };
}

function summarizeCheck(name, status, details = {}) {
  return {
    name,
    status,
    ...details,
  };
}

export async function runCanary({
  baseUrl,
  timeoutMs = 15000,
  categoryPath = '',
  requireSecurityHeaders = false,
} = {}) {
  const normalizedBase = normalizeBaseUrl(baseUrl);
  const checks = [];

  const homepageUrl = `${normalizedBase}/`;
  const homepage = await verifyPage({
    baseUrl: normalizedBase,
    url: homepageUrl,
    label: 'Homepage',
    timeoutMs,
    ensureWhatsapp: true,
  });
  checks.push(summarizeCheck('homepage', 'pass', homepage));

  const securityHeaderTargets = [];
  securityHeaderTargets.push(
    await probeSecurityHeaders({
      baseUrl: normalizedBase,
      url: homepageUrl,
      label: 'Homepage security headers',
      timeoutMs,
      requireSecurityHeaders,
    })
  );
  securityHeaderTargets.push(
    await probeSecurityHeaders({
      baseUrl: normalizedBase,
      url: `${normalizedBase}/pages/bebidas.html`,
      label: 'Legacy category security headers',
      timeoutMs,
      requireSecurityHeaders,
    })
  );
  checks.push(
    summarizeCheck(
      'security-headers-baseline',
      securityHeaderTargets.every((target) => target.securityHeaders.ok) ? 'pass' : 'warn',
      {
        requireSecurityHeaders,
        targets: securityHeaderTargets,
      }
    )
  );

  const productDataUrl = `${normalizedBase}/data/product_data.json`;
  const productDataResponse = await assertHttpOk(
    normalizedBase,
    productDataUrl,
    'Product data',
    timeoutMs
  );
  const productPayload = await productDataResponse.json();
  if (!Array.isArray(productPayload?.products) || productPayload.products.length === 0) {
    fail('Product data endpoint returned empty or invalid products payload.');
  }
  checks.push(
    summarizeCheck('product-data-endpoint', 'pass', {
      url: productDataUrl,
      productCount: productPayload.products.length,
    })
  );

  const serviceWorkerUrl = `${normalizedBase}/service-worker.js`;
  await assertHttpOk(normalizedBase, serviceWorkerUrl, 'Service worker', timeoutMs);
  checks.push(
    summarizeCheck('service-worker', 'pass', {
      url: serviceWorkerUrl,
    })
  );

  let categoryPagePath = categoryPath ? normalizePathname(categoryPath) : '';
  if (!categoryPagePath) {
    const sitemapUrl = `${normalizedBase}/sitemap.xml`;
    const sitemapResponse = await assertHttpOk(normalizedBase, sitemapUrl, 'Sitemap', timeoutMs);
    const sitemap = await sitemapResponse.text();
    categoryPagePath = extractCategoryPathFromSitemap(sitemap) || '/cervezas/';
  }
  const categoryUrl = `${normalizedBase}${categoryPagePath}`;
  const category = await verifyPage({
    baseUrl: normalizedBase,
    url: categoryUrl,
    label: 'Category page',
    timeoutMs,
  });
  checks.push(
    summarizeCheck('category-page', 'pass', {
      ...category,
      path: categoryPagePath,
    })
  );

  return {
    baseUrl: normalizedBase,
    generatedAt: new Date().toISOString(),
    checks,
  };
}

async function runCli() {
  const { values } = parseArgs({
    options: {
      'base-url': { type: 'string' },
      'timeout-ms': { type: 'string' },
      'category-path': { type: 'string' },
      report: { type: 'string' },
      'require-security-headers': { type: 'boolean' },
    },
    allowPositionals: false,
  });

  const timeoutMsRaw = Number(values['timeout-ms'] || 15000);
  const timeoutMs = Number.isFinite(timeoutMsRaw) && timeoutMsRaw > 0 ? timeoutMsRaw : 15000;
  const baseUrl = values['base-url'] || '';

  try {
    const report = await runCanary({
      baseUrl,
      timeoutMs,
      categoryPath: values['category-path'] || '',
      requireSecurityHeaders: values['require-security-headers'] === true,
    });

    if (values.report) {
      await mkdir(path.dirname(values.report), { recursive: true });
      await writeFile(values.report, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    }
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    if (values.report) {
      await mkdir(path.dirname(values.report), { recursive: true });
      const failureReport = {
        baseUrl,
        generatedAt: new Date().toISOString(),
        error: error?.message || String(error),
        checks: [],
      };
      await writeFile(values.report, `${JSON.stringify(failureReport, null, 2)}\n`, 'utf8');
    }
    throw error;
  }
}

const isDirectRun = process.argv[1] === fileURLToPath(import.meta.url);
if (isDirectRun) {
  runCli().catch((error) => {
    console.error(error.message || String(error));
    process.exitCode = 1;
  });
}
