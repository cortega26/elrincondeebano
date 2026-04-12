import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import {
  assertAllowlistedHttpsUrl,
  assertSupportedOgImageUrl,
  extractCanonicalHref,
  extractMetaContent,
  extractTitle,
  looksLikeChallenge,
  normalizeAllowlistedBaseUrl,
} from './share-preview-contract.mjs';

const DEFAULT_BASE_URL = 'https://www.elrincondeebano.com';
const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_REPORT_PATH = path.resolve('reports', 'share-preview', 'latest.json');
const ALLOWED_HOSTS = new Set(['www.elrincondeebano.com', 'elrincondeebano.com']);
const WHATSAPP_BOT_HEADERS = Object.freeze({
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'accept-language': 'en-US,en;q=0.8',
  'cache-control': 'no-cache',
  pragma: 'no-cache',
  'user-agent': 'WhatsApp/2.24.81 A',
});

function fail(message) {
  throw new Error(message);
}

function ensureAllowedUrl(url, label) {
  assertAllowlistedHttpsUrl(url, label, { allowedHosts: ALLOWED_HOSTS });
}

export function normalizeBaseUrl(rawBaseUrl = DEFAULT_BASE_URL) {
  return normalizeAllowlistedBaseUrl(rawBaseUrl, {
    allowedHosts: ALLOWED_HOSTS,
    defaultBaseUrl: DEFAULT_BASE_URL,
    label: 'Base URL',
  });
}

function extractSitemapLocs(xml) {
  return Array.from(xml.matchAll(/<loc>([^<]+)<\/loc>/g)).map((match) => match[1]);
}

function selectSharePreviewTargets(sitemapXml) {
  const locs = extractSitemapLocs(sitemapXml).filter((loc) => loc.startsWith(DEFAULT_BASE_URL));
  const homepage = `${DEFAULT_BASE_URL}/`;
  const category = locs.find((loc) => {
    const pathname = new URL(loc).pathname;
    return pathname !== '/' && !pathname.startsWith('/p/');
  });
  const product = locs.find((loc) => new URL(loc).pathname.startsWith('/p/'));

  if (!category) {
    fail('Sitemap did not expose a primary category route for share-preview monitoring.');
  }
  if (!product) {
    fail('Sitemap did not expose a product route for share-preview monitoring.');
  }

  return [
    { name: 'homepage', url: homepage },
    { name: 'category', url: category },
    { name: 'product', url: product },
  ];
}

function assertPreviewContract({ html, finalUrl, label }) {
  if (looksLikeChallenge(html)) {
    fail(`${label} returned a challenge/interstitial page instead of the public storefront.`);
  }

  const title = extractTitle(html);
  const canonical = extractCanonicalHref(html);
  const ogUrl = extractMetaContent(html, 'property', 'og:url');
  const description = extractMetaContent(html, 'name', 'description');
  const ogDescription = extractMetaContent(html, 'property', 'og:description');
  const twitterDescription = extractMetaContent(html, 'name', 'twitter:description');
  const ogTitle = extractMetaContent(html, 'property', 'og:title');
  const twitterTitle = extractMetaContent(html, 'name', 'twitter:title');
  const ogImage = extractMetaContent(html, 'property', 'og:image');
  const ogImageType = extractMetaContent(html, 'property', 'og:image:type');
  const ogImageWidth = extractMetaContent(html, 'property', 'og:image:width');
  const ogImageHeight = extractMetaContent(html, 'property', 'og:image:height');
  const twitterCard = extractMetaContent(html, 'name', 'twitter:card');

  if (!title) {
    fail(`${label} is missing a <title>.`);
  }
  if (!canonical || canonical !== finalUrl) {
    fail(`${label} canonical must match the final public URL. Expected ${finalUrl}, got ${String(canonical)}`);
  }
  if (!ogUrl || ogUrl !== canonical) {
    fail(`${label} og:url must match canonical.`);
  }
  if (!description || description !== ogDescription || description !== twitterDescription) {
    fail(`${label} description, og:description, and twitter:description must be present and identical.`);
  }
  if (!ogTitle || ogTitle !== twitterTitle) {
    fail(`${label} og:title and twitter:title must be present and identical.`);
  }
  if (twitterCard !== 'summary_large_image') {
    fail(`${label} must emit twitter:card=summary_large_image.`);
  }
  if (!ogImage || !/^https:\/\/www\.elrincondeebano\.com\/.+\.(?:jpe?g|png)(?:\?[^"]+)?$/i.test(ogImage)) {
    fail(`${label} must emit an absolute same-origin JPG/PNG og:image.`);
  }
  assertSupportedOgImageUrl(ogImage, `${label} og:image`);
  if (!/^image\/(?:jpeg|png)$/i.test(String(ogImageType || ''))) {
    fail(`${label} must emit og:image:type=image/jpeg or image/png.`);
  }
  if (ogImageWidth !== '1200' || ogImageHeight !== '1200') {
    fail(`${label} must emit og:image dimensions 1200x1200.`);
  }

  return {
    title,
    canonical,
    description,
    ogImage,
  };
}

async function fetchWithTimeout(url, timeoutMs, accept = 'text/html') {
  const target = url instanceof URL ? new URL(url.toString()) : new URL(String(url));
  ensureAllowedUrl(target, 'Probe target');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(target, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        ...WHATSAPP_BOT_HEADERS,
        accept,
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

async function probeTarget({ name, url }, timeoutMs) {
  const response = await fetchWithTimeout(url, timeoutMs);
  if (!response.ok) {
    fail(`${name} returned HTTP ${response.status}.`);
  }

  const finalUrl = response.url || String(url);
  const html = await response.text();
  const preview = assertPreviewContract({ html, finalUrl, label: name });
  const imageResponse = await fetchWithTimeout(preview.ogImage, timeoutMs, 'image/*');
  if (!imageResponse.ok) {
    fail(`${name} og:image returned HTTP ${imageResponse.status}.`);
  }

  const contentType = imageResponse.headers.get('content-type') || '';
  if (!/^image\/(?:jpeg|png)\b/i.test(contentType)) {
    fail(`${name} og:image returned unsupported content type: ${contentType}`);
  }

  return {
    name,
    url,
    finalUrl,
    canonical: preview.canonical,
    title: preview.title,
    description: preview.description,
    ogImage: preview.ogImage,
    imageContentType: contentType,
    status: 'pass',
  };
}

export async function runSharePreviewMonitor({
  baseUrl = DEFAULT_BASE_URL,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  const sitemapResponse = await fetchWithTimeout(`${normalizedBaseUrl}/sitemap.xml`, timeoutMs, 'application/xml,text/xml');
  if (!sitemapResponse.ok) {
    fail(`sitemap.xml returned HTTP ${sitemapResponse.status}.`);
  }
  const sitemapXml = await sitemapResponse.text();
  const targets = selectSharePreviewTargets(sitemapXml).map((target) =>
    target.url.startsWith(normalizedBaseUrl)
      ? target
      : { ...target, url: target.url.replace(DEFAULT_BASE_URL, normalizedBaseUrl) }
  );

  const checks = [];
  for (const target of targets) {
    checks.push(await probeTarget(target, timeoutMs));
  }

  return {
    baseUrl: normalizedBaseUrl,
    checkedAt: new Date().toISOString(),
    checks,
  };
}

async function main() {
  const { values } = parseArgs({
    options: {
      'base-url': {
        type: 'string',
      },
      'timeout-ms': {
        type: 'string',
      },
      report: {
        type: 'string',
      },
    },
  });

  const reportPath = values.report ? path.resolve(values.report) : DEFAULT_REPORT_PATH;
  const timeoutMs = values['timeout-ms'] ? Number(values['timeout-ms']) : DEFAULT_TIMEOUT_MS;
  const report = await runSharePreviewMonitor({
    baseUrl: values['base-url'] || DEFAULT_BASE_URL,
    timeoutMs,
  });

  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`Share-preview monitor passed for ${report.checks.length} route(s). Report: ${reportPath}`);
}

const isMainModule =
  process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname;

if (isMainModule) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  });
}

export { extractMetaContent, extractCanonicalHref, extractSitemapLocs, looksLikeChallenge };
