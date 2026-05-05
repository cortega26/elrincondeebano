import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import {
  assertAllowlistedHttpsUrl,
  assertSupportedOgImageUrl,
  extractCanonicalHref,
  extractMetaContent,
  extractTitle,
  looksLikeChallenge,
} from './share-preview-contract.mjs';
import { normalizeBaseUrl } from './share-preview-monitor.mjs';

const DEFAULT_BASE_URL = 'https://www.elrincondeebano.com';
const DEFAULT_ROUTE = '/';
const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_ATTEMPTS = 5;
const DEFAULT_REPORT_PATH = path.resolve('reports', 'share-preview', 'diagnostics-home.json');
const ALLOWED_HOSTS = new Set(['www.elrincondeebano.com', 'elrincondeebano.com']);
const ALLOWED_ORIGINS = new Set(['https://www.elrincondeebano.com', 'https://elrincondeebano.com']);
const CHALLENGE_PATTERN =
  /attention required|just a moment|cf-browser-verification|cdn-cgi\/challenge-platform|enable javascript and cookies/i;

const REQUEST_PROFILES = Object.freeze({
  browser: Object.freeze({
    name: 'browser',
    headers: Object.freeze({
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
    }),
  }),
  whatsapp: Object.freeze({
    name: 'whatsapp',
    headers: Object.freeze({
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'accept-language': 'en-US,en;q=0.8',
      'cache-control': 'no-cache',
      pragma: 'no-cache',
      'user-agent': 'WhatsApp/2.24.81 A',
    }),
  }),
  facebook: Object.freeze({
    name: 'facebook',
    headers: Object.freeze({
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'accept-language': 'en-US,en;q=0.8',
      'cache-control': 'no-cache',
      pragma: 'no-cache',
      'user-agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
    }),
  }),
});

function digestText(value) {
  return crypto
    .createHash('sha1')
    .update(String(value || ''), 'utf8')
    .digest('hex')
    .slice(0, 12);
}

function writeReport(reportPath, payload) {
  const resolvedPath = path.resolve(reportPath || DEFAULT_REPORT_PATH);
  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  fs.writeFileSync(resolvedPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return resolvedPath;
}

function normalizeRoute(rawRoute = DEFAULT_ROUTE) {
  const candidate = String(rawRoute || '').trim() || DEFAULT_ROUTE;
  if (!candidate.startsWith('/')) {
    throw new Error(`Probe route must start with "/": ${candidate}`);
  }
  if (candidate.split('/').some((segment) => segment === '..')) {
    throw new Error(`Path traversal is not allowed in probes: ${candidate}`);
  }
  return candidate;
}

export function normalizeProfiles(rawProfiles) {
  const input = Array.isArray(rawProfiles)
    ? rawProfiles
    : String(rawProfiles || '')
        .split(',')
        .map((profile) => profile.trim())
        .filter(Boolean);

  const profiles = input.length > 0 ? input : ['browser', 'whatsapp', 'facebook'];
  const unknown = profiles.filter((profile) => !REQUEST_PROFILES[profile]);
  if (unknown.length > 0) {
    throw new Error(`Unsupported share-preview profile(s): ${unknown.join(', ')}`);
  }

  return profiles;
}

export function resolveTargetUrl(baseUrl, route = DEFAULT_ROUTE) {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl || DEFAULT_BASE_URL);
  const normalizedRoute = normalizeRoute(route);
  const base = new URL(`${normalizedBaseUrl}/`);
  const target = new URL(normalizedRoute, base);
  assertAllowlistedHttpsUrl(target, 'Probe target', { allowedHosts: ALLOWED_HOSTS });
  return target.toString();
}

function collectResponseHeaders(headers) {
  return {
    contentType: headers.get('content-type') || null,
    cacheControl: headers.get('cache-control') || null,
    cfCacheStatus: headers.get('cf-cache-status') || null,
    cfRay: headers.get('cf-ray') || null,
    age: headers.get('age') || null,
    etag: headers.get('etag') || null,
    lastModified: headers.get('last-modified') || null,
    contentLength: headers.get('content-length') || null,
  };
}

function extractChallengeEvidence(html) {
  const normalized = String(html || '')
    .replace(/\s+/g, ' ')
    .trim();
  const match = normalized.match(CHALLENGE_PATTERN);
  if (!match || typeof match.index !== 'number') {
    return null;
  }

  const start = Math.max(0, match.index - 80);
  const end = Math.min(normalized.length, match.index + 180);
  return normalized.slice(start, end).trim();
}

function buildHtmlProbe({ requestedUrl, response, html }) {
  return {
    requestedUrl: String(requestedUrl),
    finalUrl: response.url || String(requestedUrl),
    statusCode: response.status,
    bodySha1: digestText(html),
    challengeDetected: looksLikeChallenge(html),
    challengeEvidence: extractChallengeEvidence(html),
    ...collectResponseHeaders(response.headers),
  };
}

function buildResponseProbe({ requestedUrl, response }) {
  return {
    requestedUrl: String(requestedUrl),
    finalUrl: response.url || String(requestedUrl),
    statusCode: response.status,
    ...collectResponseHeaders(response.headers),
  };
}

function toAllowlistedFetchUrl(target) {
  const suffix = `${target.pathname}${target.search}${target.hash}`;

  switch (target.origin) {
    case 'https://www.elrincondeebano.com':
      return new URL(suffix, 'https://www.elrincondeebano.com');
    case 'https://elrincondeebano.com':
      return new URL(suffix, 'https://elrincondeebano.com');
    default:
      throw new Error(`Probe target must use an allowlisted origin: ${target.toString()}`);
  }
}

async function fetchWithTimeout(url, timeoutMs, headers) {
  const target = url instanceof URL ? new URL(url.toString()) : new URL(String(url));
  assertAllowlistedHttpsUrl(target, 'Probe target', { allowedHosts: ALLOWED_HOSTS });
  if (!ALLOWED_ORIGINS.has(target.origin)) {
    throw new Error(`Probe target must use an allowlisted origin: ${target.toString()}`);
  }
  const targetUrl = toAllowlistedFetchUrl(target);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(targetUrl, {
      signal: controller.signal,
      redirect: 'follow',
      headers,
    });
  } finally {
    clearTimeout(timer);
  }
}

function inspectPreviewMetadata(html, finalUrl) {
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
  const contractIssues = [];

  if (!title) {
    contractIssues.push('missing-title');
  }
  if (!canonical) {
    contractIssues.push('missing-canonical');
  }
  if (canonical && canonical !== finalUrl) {
    contractIssues.push('canonical-mismatch');
  }
  if (!ogUrl) {
    contractIssues.push('missing-og-url');
  }
  if (ogUrl && canonical && ogUrl !== canonical) {
    contractIssues.push('og-url-mismatch');
  }
  if (!description || description !== ogDescription || description !== twitterDescription) {
    contractIssues.push('description-mismatch');
  }
  if (!ogTitle || ogTitle !== twitterTitle) {
    contractIssues.push('title-mismatch');
  }
  if (twitterCard !== 'summary_large_image') {
    contractIssues.push('invalid-twitter-card');
  }
  if (!ogImage) {
    contractIssues.push('missing-og-image');
  } else {
    try {
      assertSupportedOgImageUrl(ogImage, 'og:image');
    } catch {
      contractIssues.push('invalid-og-image-url');
    }
  }
  if (!/^image\/(?:jpeg|png)$/i.test(String(ogImageType || ''))) {
    contractIssues.push('invalid-og-image-type');
  }
  if (ogImageWidth !== '1200' || ogImageHeight !== '1200') {
    contractIssues.push('invalid-og-image-dimensions');
  }

  return {
    title,
    canonical,
    ogUrl,
    description,
    ogDescription,
    twitterDescription,
    ogTitle,
    twitterTitle,
    ogImage,
    ogImageType,
    ogImageWidth,
    ogImageHeight,
    twitterCard,
    contractIssues,
  };
}

async function runAttempt(targetUrl, profile, timeoutMs, attemptNumber) {
  const startedAt = new Date().toISOString();
  const result = {
    attempt: attemptNumber,
    profile: profile.name,
    userAgent: profile.headers['user-agent'] || '',
    startedAt,
    success: false,
    failurePhase: '',
    failureMessage: '',
    html: null,
    preview: null,
    image: null,
  };

  try {
    const htmlResponse = await fetchWithTimeout(targetUrl, timeoutMs, profile.headers);
    const html = await htmlResponse.text();
    result.html = buildHtmlProbe({ requestedUrl: targetUrl, response: htmlResponse, html });
    result.preview = inspectPreviewMetadata(html, result.html.finalUrl);

    if (!htmlResponse.ok) {
      result.failurePhase = 'html';
      result.failureMessage = `HTML probe returned HTTP ${htmlResponse.status}.`;
      return result;
    }
    if (result.html.challengeDetected) {
      result.failurePhase = 'html';
      result.failureMessage = 'HTML probe returned a challenge/interstitial page.';
      return result;
    }
    if (result.preview.contractIssues.length > 0) {
      result.failurePhase = 'html';
      result.failureMessage = `Metadata issues: ${result.preview.contractIssues.join(', ')}`;
      return result;
    }

    const imageResponse = await fetchWithTimeout(
      previewImageHeaders(result.preview.ogImage),
      timeoutMs,
      {
        ...profile.headers,
        accept: 'image/*',
      }
    );
    result.image = buildResponseProbe({
      requestedUrl: result.preview.ogImage,
      response: imageResponse,
    });

    if (!imageResponse.ok) {
      result.failurePhase = 'image';
      result.failureMessage = `og:image returned HTTP ${imageResponse.status}.`;
      return result;
    }

    const imageContentType = result.image.contentType || '';
    if (!/^image\/(?:jpeg|png)\b/i.test(imageContentType)) {
      result.failurePhase = 'image';
      result.failureMessage = `og:image returned unsupported content type: ${imageContentType}`;
      return result;
    }

    result.success = true;
    return result;
  } catch (error) {
    result.failurePhase = result.failurePhase || 'network';
    result.failureMessage = error?.message || String(error);
    return result;
  } finally {
    result.finishedAt = new Date().toISOString();
  }
}

function previewImageHeaders(ogImageUrl) {
  return ogImageUrl;
}

function summarizeProfileAttempts(profileName, attempts) {
  const successCount = attempts.filter((attempt) => attempt.success).length;
  const failureCount = attempts.length - successCount;
  const htmlFailureCount = attempts.filter((attempt) => attempt.failurePhase === 'html').length;
  const imageFailureCount = attempts.filter((attempt) => attempt.failurePhase === 'image').length;
  const networkFailureCount = attempts.filter(
    (attempt) => attempt.failurePhase === 'network'
  ).length;
  const challengeCount = attempts.filter((attempt) => attempt.html?.challengeDetected).length;

  return {
    profile: profileName,
    attempts: attempts.length,
    successCount,
    failureCount,
    htmlFailureCount,
    imageFailureCount,
    networkFailureCount,
    challengeCount,
    uniqueHtmlBodyHashes: [
      ...new Set(attempts.map((attempt) => attempt.html?.bodySha1).filter(Boolean)),
    ],
    uniqueOgImages: [
      ...new Set(attempts.map((attempt) => attempt.preview?.ogImage).filter(Boolean)),
    ],
    htmlCfCacheStatuses: [
      ...new Set(attempts.map((attempt) => attempt.html?.cfCacheStatus).filter(Boolean)),
    ],
    imageCfCacheStatuses: [
      ...new Set(attempts.map((attempt) => attempt.image?.cfCacheStatus).filter(Boolean)),
    ],
  };
}

function inferSuspicions(results) {
  const suspicions = [];
  const byProfile = new Map(results.map((result) => [result.profile, result]));
  const browser = byProfile.get('browser');
  const socialProfiles = results.filter((result) => result.profile !== 'browser');
  const allProfilesChallenged =
    results.length > 0 &&
    results.every((result) => result.summary.challengeCount === result.summary.attempts);

  if (allProfilesChallenged) {
    suspicions.push({
      code: 'edge-challenge-injection',
      message:
        'Every tested profile received HTML contaminated by a challenge/interstitial script, which points to edge-side injection rather than route-specific metadata drift.',
    });
  }

  if (
    socialProfiles.some((result) => result.summary.challengeCount > 0) &&
    (!browser || browser.summary.challengeCount === 0)
  ) {
    suspicions.push({
      code: 'social-bot-challenge',
      message:
        'At least one social-bot profile received a challenge/interstitial while the browser profile did not.',
    });
  }

  if (results.some((result) => result.summary.imageFailureCount > 0)) {
    suspicions.push({
      code: 'og-image-fetch-failure',
      message: 'At least one attempt fetched valid metadata but failed while loading og:image.',
    });
  }

  if (results.some((result) => result.summary.uniqueOgImages.length > 1)) {
    suspicions.push({
      code: 'og-image-url-instability',
      message: 'The same route emitted more than one og:image URL across repeated attempts.',
    });
  }

  if (
    !allProfilesChallenged &&
    results.some((result) => result.summary.uniqueHtmlBodyHashes.length > 1)
  ) {
    suspicions.push({
      code: 'html-variant-instability',
      message: 'The same route returned more than one HTML body variant across repeated attempts.',
    });
  }

  if (results.some((result) => result.summary.networkFailureCount > 0)) {
    suspicions.push({
      code: 'network-instability',
      message: 'At least one attempt failed before the HTML or image contract could be evaluated.',
    });
  }

  return suspicions;
}

export async function runSharePreviewDiagnosis({
  baseUrl = DEFAULT_BASE_URL,
  route = DEFAULT_ROUTE,
  attempts = DEFAULT_ATTEMPTS,
  profiles,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  reportPath = DEFAULT_REPORT_PATH,
} = {}) {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  const normalizedRoute = normalizeRoute(route);
  const targetUrl = resolveTargetUrl(normalizedBaseUrl, normalizedRoute);
  const normalizedProfiles = normalizeProfiles(profiles);
  const attemptCount =
    Number.isFinite(attempts) && attempts > 0 ? Math.floor(attempts) : DEFAULT_ATTEMPTS;
  const results = [];

  for (const profileName of normalizedProfiles) {
    const profile = REQUEST_PROFILES[profileName];
    const profileAttempts = [];
    for (let attempt = 1; attempt <= attemptCount; attempt += 1) {
      profileAttempts.push(await runAttempt(targetUrl, profile, timeoutMs, attempt));
    }
    results.push({
      profile: profileName,
      userAgent: profile.headers['user-agent'] || '',
      attempts: profileAttempts,
      summary: summarizeProfileAttempts(profileName, profileAttempts),
    });
  }

  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl: normalizedBaseUrl,
    route: normalizedRoute,
    targetUrl,
    timeoutMs,
    attemptsPerProfile: attemptCount,
    profiles: normalizedProfiles,
    results,
    suspicions: inferSuspicions(results),
    success: results.every((result) => result.summary.failureCount === 0),
  };

  const resolvedReportPath = writeReport(reportPath, report);
  return {
    ...report,
    reportPath: resolvedReportPath,
  };
}

async function runCli() {
  const { values } = parseArgs({
    options: {
      'base-url': { type: 'string' },
      route: { type: 'string' },
      attempts: { type: 'string' },
      profiles: { type: 'string' },
      'timeout-ms': { type: 'string' },
      report: { type: 'string' },
    },
  });

  const attempts = values.attempts ? Number(values.attempts) : DEFAULT_ATTEMPTS;
  const timeoutMs = values['timeout-ms'] ? Number(values['timeout-ms']) : DEFAULT_TIMEOUT_MS;
  const report = await runSharePreviewDiagnosis({
    baseUrl: values['base-url'] || DEFAULT_BASE_URL,
    route: values.route || DEFAULT_ROUTE,
    attempts,
    profiles: values.profiles,
    timeoutMs,
    reportPath: values.report || DEFAULT_REPORT_PATH,
  });

  console.log(
    JSON.stringify(
      {
        success: report.success,
        reportPath: report.reportPath,
        suspicions: report.suspicions,
        results: report.results.map((result) => ({
          profile: result.profile,
          summary: result.summary,
        })),
      },
      null,
      2
    )
  );
}

const isDirectRun = process.argv[1] === fileURLToPath(import.meta.url);
if (isDirectRun) {
  runCli().catch((error) => {
    console.error(error?.message || String(error));
    process.exitCode = 1;
  });
}
