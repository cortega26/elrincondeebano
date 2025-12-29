import { log } from './logger.mts';
import { validateProductDataUrl } from './data-endpoint.mjs';

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
    console.warn('Unable to read stored product data version:', error);
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
    console.warn('Unable to persist product data version:', error);
  }
};

export class ProductDataError extends Error {
  constructor(message, { cause, correlationId }) {
    super(message);
    this.name = 'ProductDataError';
    this.correlationId = correlationId;
    if (cause) this.cause = cause;
  }
}

export const fetchWithRetry = async (url, opts, retries, backoffMs, correlationId) => {
  const sanitizedUrl = validateProductDataUrl(url);
  let attempt = 0;
  let lastError;
  while (attempt <= retries) {
    try {
      const start = Date.now();
      // URL is validated by validateProductDataUrl before fetch.
      // nosemgrep
      const response = await fetch(sanitizedUrl, opts);
      const durationMs = Date.now() - start;
      log('info', 'fetch_products_attempt', { correlationId, attempt: attempt + 1, durationMs });
      if (!response.ok) {
        throw new Error(`HTTP error. Status: ${response.status}`);
      }
      return response;
    } catch (err) {
      lastError = err;
      attempt++;
      if (attempt > retries) break;
      log('warn', 'fetch_products_retry', {
        correlationId,
        attempt,
        error: err.message,
        runbook: 'docs/operations/RUNBOOK.md#product-data',
      });
      await new Promise((resolve) => setTimeout(resolve, backoffMs * attempt));
    }
  }
  throw new ProductDataError(`Failed to fetch products: ${lastError.message}`, {
    cause: lastError,
    correlationId,
  });
};
