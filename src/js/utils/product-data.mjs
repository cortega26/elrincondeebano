import { log } from './logger.mts';
import { validateProductDataUrl } from './data-endpoint.mjs';
import { recordEndpointMetric } from '../modules/observability.mjs';

export const normalizeProductVersion = (value) => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const lowered = trimmed.toLowerCase();
  if (lowered === 'undefined' || lowered === 'null') {
    return null;
  }
  return trimmed;
};

export const getStoredProductVersion = () => {
  try {
    if (typeof localStorage === 'undefined') {
      return null;
    }
    const stored = localStorage.getItem('productDataVersion');
    const normalized = normalizeProductVersion(stored);
    if (!normalized && stored) {
      localStorage.removeItem('productDataVersion');
    }
    return normalized;
  } catch (error) {
    log('warn', 'stored_product_version_read_failed', { error });
    return null;
  }
};

export const setStoredProductVersion = (version) => {
  const normalized = normalizeProductVersion(version);
  if (!normalized) {
    return;
  }
  try {
    if (typeof localStorage === 'undefined') {
      return;
    }
    localStorage.setItem('productDataVersion', normalized);
  } catch (error) {
    log('warn', 'stored_product_version_write_failed', { error });
  }
};

export class ProductDataError extends Error {
  constructor(
    message,
    { cause, correlationId, code = 'PRODUCT_DATA_ERROR', context = {}, userMessage = null } = {}
  ) {
    super(message);
    this.name = 'ProductDataError';
    this.code = code;
    this.context = context && typeof context === 'object' ? { ...context } : {};
    this.userMessage = typeof userMessage === 'string' ? userMessage : null;
    this.correlationId = correlationId;
    if (cause) this.cause = cause;
  }
}

export const fetchWithRetry = async (url, opts, retries, backoffMs, correlationId) => {
  const sanitizedUrl = validateProductDataUrl(url);
  const method = String(opts?.method || 'GET').toUpperCase();
  let attempt = 0;
  let lastError;
  while (attempt <= retries) {
    const start = Date.now();
    try {
      // URL is validated by validateProductDataUrl before fetch.
      // nosemgrep
      const response = await fetch(sanitizedUrl, opts);
      const durationMs = Date.now() - start;
      recordEndpointMetric({
        name: 'product_data_fetch',
        url: sanitizedUrl,
        method,
        status: response.status,
        durationMs,
      });
      log('info', 'fetch_products_attempt', { correlationId, attempt: attempt + 1, durationMs });
      if (!response.ok) {
        throw new ProductDataError(`HTTP error. Status: ${response.status}`, {
          correlationId,
          code: 'PRODUCT_DATA_HTTP_ERROR',
          context: {
            status: response.status,
            url: sanitizedUrl,
            attempt: attempt + 1,
          },
        });
      }
      return response;
    } catch (err) {
      const durationMs = Date.now() - start;
      recordEndpointMetric({
        name: 'product_data_fetch',
        url: sanitizedUrl,
        method,
        status: null,
        durationMs,
      });
      lastError = err;
      attempt++;
      if (attempt > retries) break;

      const code =
        err && typeof err === 'object' && typeof err.code === 'string'
          ? err.code
          : 'PRODUCT_DATA_FETCH_RETRY';
      log('warn', 'fetch_products_retry', {
        correlationId,
        attempt,
        error: err?.message || String(err),
        errorCode: code,
        runbook: 'docs/operations/RUNBOOK.md#product-data',
      });
      await new Promise((resolve) => setTimeout(resolve, backoffMs * attempt));
    }
  }
  const code =
    lastError && typeof lastError === 'object' && typeof lastError.code === 'string'
      ? lastError.code
      : 'PRODUCT_DATA_FETCH_FAILED';
  const context =
    lastError && typeof lastError === 'object' && lastError.context && typeof lastError.context === 'object'
      ? lastError.context
      : { url: sanitizedUrl, retries, attempts: attempt };
  throw new ProductDataError(`Failed to fetch products: ${lastError?.message || String(lastError)}`, {
    cause: lastError,
    correlationId,
    code,
    context,
  });
};
