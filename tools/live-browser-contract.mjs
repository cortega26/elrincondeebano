import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import {
  inspectPublicHtmlEdgeSurface,
  SECURITY_HEADER_BASELINE_ROUTES,
} from './security-header-policy.mjs';

const DEFAULT_BASE_URL = 'https://www.elrincondeebano.com';
const DEFAULT_TIMEOUT_MS = 15000;
const ALLOWED_HOSTS = new Set(['www.elrincondeebano.com', 'elrincondeebano.com']);

function assertAllowedUrl(url, label) {
  if (!(url instanceof URL)) {
    throw new Error(`${label} must be a URL instance.`);
  }
  if (url.protocol !== 'https:') {
    throw new Error(`${label} must use HTTPS: ${url.toString()}`);
  }
  if (url.username || url.password) {
    throw new Error(`${label} must not include credentials: ${url.toString()}`);
  }
  if (!ALLOWED_HOSTS.has(url.hostname)) {
    throw new Error(`${label} must target an allowlisted host: ${url.toString()}`);
  }
}

export function normalizeBaseUrl(rawBaseUrl = DEFAULT_BASE_URL) {
  const candidate =
    typeof rawBaseUrl === 'string' && rawBaseUrl.trim() ? rawBaseUrl.trim() : DEFAULT_BASE_URL;
  const parsed = new URL(candidate);
  assertAllowedUrl(parsed, 'Base URL');
  parsed.pathname = '';
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString().replace(/\/$/, '');
}

export function resolveProbeUrl(baseUrl, route) {
  const normalizedRoute = String(route || '').trim();
  if (!normalizedRoute.startsWith('/')) {
    throw new Error(`Probe route must start with "/": ${normalizedRoute}`);
  }
  if (normalizedRoute.split('/').some((segment) => segment === '..')) {
    throw new Error(`Path traversal is not allowed in probes: ${normalizedRoute}`);
  }

  const base = new URL(`${normalizeBaseUrl(baseUrl)}/`);
  const target = new URL(normalizedRoute, base);
  assertAllowedUrl(target, 'Probe target');
  return target.toString();
}

function writeReport(reportPath, payload) {
  if (!reportPath) {
    return;
  }

  const resolvedPath = path.resolve(reportPath);
  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  fs.writeFileSync(resolvedPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function simplifyConsoleMessage(message) {
  return {
    type: message.type(),
    text: message.text(),
  };
}

export async function inspectBrowserRoute(browser, baseUrl, route, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const page = await browser.newPage();
  const targetUrl = resolveProbeUrl(baseUrl, route);
  const consoleMessages = [];
  const consoleErrors = [];
  const pageErrors = [];
  const requestFailures = [];

  page.on('console', (message) => {
    const entry = simplifyConsoleMessage(message);
    consoleMessages.push(entry);
    if (entry.type === 'error') {
      consoleErrors.push(entry.text);
    }
  });

  page.on('pageerror', (error) => {
    pageErrors.push(error.message);
  });

  page.on('requestfailed', (request) => {
    const resourceType = request.resourceType();
    if (!['document', 'script'].includes(resourceType)) {
      return;
    }

    requestFailures.push({
      url: request.url(),
      resourceType,
      errorText: request.failure()?.errorText || 'request failed',
    });
  });

  try {
    await page.goto(targetUrl, {
      waitUntil: 'domcontentloaded',
      timeout: timeoutMs,
    });
    await page
      .waitForLoadState('networkidle', { timeout: Math.min(timeoutMs, 5000) })
      .catch(() => {});
    await page.waitForTimeout(1000);

    const html = await page.content();
    const htmlSurface = inspectPublicHtmlEdgeSurface(html);
    const externalInsightsBeaconDetected = Boolean(
      await page.locator('script[src*="static.cloudflareinsights.com/beacon.min.js"]').count()
    );

    return {
      route,
      url: targetUrl,
      htmlSurface,
      consoleMessages,
      consoleErrors,
      pageErrors,
      requestFailures,
      externalInsightsBeaconDetected,
      ok:
        htmlSurface.ok &&
        consoleErrors.length === 0 &&
        pageErrors.length === 0 &&
        requestFailures.length === 0,
    };
  } finally {
    await page.close();
  }
}

export async function runLiveBrowserContract({
  baseUrl = DEFAULT_BASE_URL,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  reportPath = '',
} = {}) {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  const browser = await chromium.launch({ headless: true });

  try {
    const routeResults = [];

    for (const route of SECURITY_HEADER_BASELINE_ROUTES) {
      routeResults.push(await inspectBrowserRoute(browser, normalizedBaseUrl, route, timeoutMs));
    }

    const failures = routeResults.filter((result) => !result.ok);
    const report = {
      generatedAt: new Date().toISOString(),
      baseUrl: normalizedBaseUrl,
      timeoutMs,
      routes: SECURITY_HEADER_BASELINE_ROUTES,
      routeResults,
      failures,
      success: failures.length === 0,
    };

    writeReport(reportPath, report);
    console.log(JSON.stringify(report, null, 2));

    if (failures.length > 0) {
      throw new Error(`Live browser contract found ${failures.length} failing route(s).`);
    }
  } finally {
    await browser.close();
  }
}

async function runCli() {
  const { values } = parseArgs({
    options: {
      'base-url': { type: 'string' },
      'timeout-ms': { type: 'string' },
      report: { type: 'string' },
    },
    allowPositionals: false,
  });

  const timeoutRaw = Number(values['timeout-ms']);
  const timeoutMs = Number.isFinite(timeoutRaw) && timeoutRaw > 0 ? timeoutRaw : DEFAULT_TIMEOUT_MS;

  await runLiveBrowserContract({
    baseUrl: values['base-url'] || DEFAULT_BASE_URL,
    timeoutMs,
    reportPath: values.report || '',
  });
}

const isDirectRun = process.argv[1] === fileURLToPath(import.meta.url);
if (isDirectRun) {
  runCli().catch((error) => {
    console.error(error?.message || String(error));
    process.exitCode = 1;
  });
}
