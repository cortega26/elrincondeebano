import { writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

function fail(message) {
  throw new Error(message);
}

export function normalizeBaseUrl(raw) {
  if (typeof raw !== 'string' || !raw.trim()) {
    fail('Missing required --base-url value.');
  }
  let parsed;
  try {
    parsed = new URL(raw.trim());
  } catch {
    fail(`Invalid base URL: ${raw}`);
  }
  if (parsed.protocol !== 'https:') {
    fail(`Base URL must use HTTPS: ${parsed.toString()}`);
  }
  parsed.pathname = '';
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString().replace(/\/$/, '');
}

export function normalizePathname(pathname) {
  const value = String(pathname || '').trim();
  if (!value) {
    return '/';
  }
  return value.startsWith('/') ? value : `/${value}`;
}

function escapeRegExp(input) {
  return String(input).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function extractMetaContent(html, attribute, key) {
  const attr = escapeRegExp(attribute);
  const needle = escapeRegExp(key);
  const regex = new RegExp(
    `<meta[^>]*${attr}\\s*=\\s*["']${needle}["'][^>]*content\\s*=\\s*["']([^"']+)["'][^>]*>`,
    'i'
  );
  const match = regex.exec(html);
  return match ? match[1] : null;
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
  const regex = /<loc>\s*https:\/\/[^<]+(\/pages\/[a-z0-9_-]+\.html)\s*<\/loc>/gi;
  const matches = [];
  let match = regex.exec(xml);
  while (match) {
    matches.push(match[1]);
    match = regex.exec(xml);
  }
  return matches.sort()[0] || null;
}

function ensureAbsoluteHttpsUrl(value, label) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail(`${label} must be an absolute URL: ${value}`);
  }
  if (parsed.protocol !== 'https:') {
    fail(`${label} must use HTTPS: ${value}`);
  }
  return parsed.toString();
}

async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: {
        'cache-control': 'no-cache',
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

async function assertHttpOk(url, label, timeoutMs) {
  const response = await fetchWithTimeout(url, timeoutMs);
  if (!response.ok) {
    fail(`${label} returned ${response.status} for ${url}`);
  }
  return response;
}

function ensureWhatsAppPresence(html, pageLabel) {
  const hasWhatsapp =
    /wa\.me\//i.test(html) ||
    /api\.whatsapp\.com\/send/i.test(html) ||
    /whatsapp/i.test(html);
  if (!hasWhatsapp) {
    fail(`${pageLabel} does not appear to include WhatsApp flow references.`);
  }
}

async function verifyPage({
  url,
  label,
  timeoutMs,
  ensureWhatsapp = false,
}) {
  const response = await assertHttpOk(url, label, timeoutMs);
  const html = await response.text();
  assertOgContract(html, label);
  const ogImage = extractMetaContent(html, 'property', 'og:image');
  const absoluteOgImage = ensureAbsoluteHttpsUrl(ogImage, `${label} og:image`);
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
    absoluteOgImage,
    `${label} og:image`,
    timeoutMs
  );
  const contentType = imageResponse.headers.get('content-type') || '';
  if (!contentType.toLowerCase().startsWith('image/')) {
    fail(`${label} og:image returned non-image content type: ${contentType}`);
  }

  return {
    url,
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
} = {}) {
  const normalizedBase = normalizeBaseUrl(baseUrl);
  const checks = [];

  const homepageUrl = `${normalizedBase}/`;
  const homepage = await verifyPage({
    url: homepageUrl,
    label: 'Homepage',
    timeoutMs,
    ensureWhatsapp: true,
  });
  checks.push(summarizeCheck('homepage', 'pass', homepage));

  const productDataUrl = `${normalizedBase}/data/product_data.json`;
  const productDataResponse = await assertHttpOk(
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
  await assertHttpOk(serviceWorkerUrl, 'Service worker', timeoutMs);
  checks.push(
    summarizeCheck('service-worker', 'pass', {
      url: serviceWorkerUrl,
    })
  );

  let categoryPagePath = categoryPath ? normalizePathname(categoryPath) : '';
  if (!categoryPagePath) {
    const sitemapUrl = `${normalizedBase}/sitemap.xml`;
    const sitemapResponse = await assertHttpOk(sitemapUrl, 'Sitemap', timeoutMs);
    const sitemap = await sitemapResponse.text();
    categoryPagePath = extractCategoryPathFromSitemap(sitemap) || '/pages/cervezas.html';
  }
  const categoryUrl = `${normalizedBase}${categoryPagePath}`;
  const category = await verifyPage({
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
    },
    allowPositionals: false,
  });

  const timeoutMsRaw = Number(values['timeout-ms'] || 15000);
  const timeoutMs = Number.isFinite(timeoutMsRaw) && timeoutMsRaw > 0 ? timeoutMsRaw : 15000;

  const report = await runCanary({
    baseUrl: values['base-url'] || '',
    timeoutMs,
    categoryPath: values['category-path'] || '',
  });

  if (values.report) {
    await writeFile(values.report, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  }
  console.log(JSON.stringify(report, null, 2));
}

const isDirectRun = process.argv[1] === fileURLToPath(import.meta.url);
if (isDirectRun) {
  runCli().catch((error) => {
    console.error(error.message || String(error));
    process.exitCode = 1;
  });
}
