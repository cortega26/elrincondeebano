'use strict';

const http = require('node:http');
const path = require('node:path');
const crypto = require('node:crypto');
const { URL } = require('node:url');
const { ProductStore } = require('./productStore');

const MAX_PAYLOAD_BYTES = 1_000_000;
const API_SECURITY_HEADERS = Object.freeze({
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
  'cross-origin-resource-policy': 'same-origin',
  'cache-control': 'no-store',
  pragma: 'no-cache',
  'content-security-policy':
    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
});
const SENSITIVE_KEY_PATTERN =
  /(authorization|cookie|token|secret|password|api[-_]?key|session|credential)/i;
const CORRELATION_ID_PATTERN = /^[A-Za-z0-9._:-]{8,80}$/;
const AUTH_BEARER_PATTERN = /^Bearer\s+(.+)$/i;

function createCorrelationId() {
  try {
    return crypto.randomUUID();
  } catch (error) {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

function normalizeCorrelationId(value) {
  if (Array.isArray(value)) {
    return normalizeCorrelationId(value[0]);
  }
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed || !CORRELATION_ID_PATTERN.test(trimmed)) {
    return null;
  }
  return trimmed;
}

function normalizeToken(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
}

function parseBooleanEnv(value, fallback) {
  if (typeof value !== 'string') {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === '1' || normalized === 'true' || normalized === 'yes') {
    return true;
  }
  if (normalized === '0' || normalized === 'false' || normalized === 'no') {
    return false;
  }
  return fallback;
}

function resolveAuthConfig(options = {}) {
  const syncApiToken = normalizeToken(options.syncApiToken || process.env.SYNC_API_TOKEN || '');
  const requirePatchAuth = parseBooleanEnv(
    process.env.SYNC_API_REQUIRE_AUTH,
    options.requirePatchAuth ?? process.env.NODE_ENV === 'production'
  );
  const strictAuthStartup = parseBooleanEnv(
    process.env.SYNC_API_STRICT_STARTUP,
    options.strictAuthStartup ?? false
  );
  return Object.freeze({
    syncApiToken,
    requirePatchAuth: Boolean(requirePatchAuth),
    strictAuthStartup: Boolean(strictAuthStartup),
  });
}

function extractBearerToken(headerValue) {
  const raw = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  if (typeof raw !== 'string') {
    return '';
  }
  const match = AUTH_BEARER_PATTERN.exec(raw.trim());
  if (!match) {
    return '';
  }
  return normalizeToken(match[1]);
}

function tokensMatch(expectedToken, actualToken) {
  if (!expectedToken || !actualToken) {
    return false;
  }
  const expected = Buffer.from(expectedToken, 'utf8');
  const actual = Buffer.from(actualToken, 'utf8');
  if (expected.length !== actual.length) {
    return false;
  }
  return crypto.timingSafeEqual(expected, actual);
}

function authorizePatchRequest(req, authConfig) {
  if (!authConfig.requirePatchAuth) {
    return { ok: true };
  }
  if (!authConfig.syncApiToken) {
    return {
      ok: false,
      statusCode: 503,
      code: 'SYNC_AUTH_NOT_CONFIGURED',
      message: 'Sync API authentication is not configured',
    };
  }
  const providedToken = extractBearerToken(req.headers.authorization);
  if (!tokensMatch(authConfig.syncApiToken, providedToken)) {
    return {
      ok: false,
      statusCode: 401,
      code: 'UNAUTHORIZED',
      message: 'Unauthorized',
    };
  }
  return { ok: true };
}

function sanitizeLogValue(value, key = '', seen = new WeakSet()) {
  if (SENSITIVE_KEY_PATTERN.test(key)) {
    return '[REDACTED]';
  }
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === 'string') {
    return value.length > 256 ? `${value.slice(0, 253)}...` : value;
  }
  if (typeof value !== 'object') {
    return value;
  }
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
    };
  }
  if (seen.has(value)) {
    return '[Circular]';
  }
  seen.add(value);
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeLogValue(item, key, seen));
  }
  const output = {};
  for (const [nestedKey, nestedValue] of Object.entries(value)) {
    output[nestedKey] = sanitizeLogValue(nestedValue, nestedKey, seen);
  }
  return output;
}

function logApi(level, event, meta = {}) {
  const payload = {
    level,
    event,
    timestamp: new Date().toISOString(),
    ...sanitizeLogValue(meta),
  };
  const out = JSON.stringify(payload);
  if (typeof console[level] === 'function') {
    console[level](out);
  } else {
    console.log(out);
  }
}

function createErrorPayload({ code, message, context = {}, cause = null }) {
  return {
    error: message,
    code,
    message,
    context,
    cause,
  };
}

function writeJson(res, statusCode, payload, extraHeaders = {}) {
  res.writeHead(statusCode, {
    ...API_SECURITY_HEADERS,
    'content-type': 'application/json; charset=utf-8',
    ...extraHeaders,
  });
  res.end(JSON.stringify(payload));
}

function writeError(res, statusCode, details, requestId) {
  const payload = createErrorPayload(details);
  writeJson(res, statusCode, payload, { 'x-correlation-id': requestId });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalBytes = 0;
    let settled = false;

    const onError = (error) => {
      if (settled) {
        return;
      }
      settled = true;
      reject(error);
    };

    const onData = (chunk) => {
      if (settled) {
        return;
      }
      chunks.push(chunk);
      totalBytes += chunk.length;
      if (totalBytes > MAX_PAYLOAD_BYTES) {
        const error = new Error('Payload too large');
        error.statusCode = 413;
        settled = true;
        reject(error);
        // Drain remaining bytes so the connection can be closed gracefully by caller.
        req.removeListener('data', onData);
        req.on('data', () => {});
        req.resume();
      }
    };

    const onEnd = () => {
      if (settled) {
        return;
      }
      if (!chunks.length) {
        settled = true;
        resolve(null);
        return;
      }
      const raw = Buffer.concat(chunks).toString('utf8');
      try {
        settled = true;
        resolve(JSON.parse(raw));
      } catch (error) {
        const parseError = new Error('Invalid JSON payload');
        parseError.statusCode = 400;
        settled = true;
        reject(parseError);
      }
    };

    req.on('data', onData);
    req.on('end', onEnd);
    req.on('error', onError);
  });
}

function sanitizeSource(value) {
  if (value === 'admin' || value === 'offline') {
    return value;
  }
  return 'admin';
}

async function handlePatch(store, req, res, url, requestId) {
  let productId;
  try {
    productId = decodeURIComponent(url.pathname.replace('/api/products/', ''));
  } catch (error) {
    writeError(
      res,
      400,
      {
        code: 'INVALID_PRODUCT_IDENTIFIER',
        message: 'Invalid product identifier',
        context: { method: req.method, path: url.pathname },
        cause: null,
      },
      requestId
    );
    return;
  }
  let body;
  try {
    body = await readBody(req);
  } catch (error) {
    const statusCode = error.statusCode || 400;
    const code = statusCode === 413 ? 'PAYLOAD_TOO_LARGE' : 'INVALID_JSON_PAYLOAD';
    writeError(
      res,
      statusCode,
      {
        code,
        message: error.message || 'Invalid request payload',
        context: { method: req.method, path: url.pathname },
        cause: null,
      },
      requestId
    );
    logApi('warn', 'sync_api_invalid_payload', {
      requestId,
      code,
      statusCode,
      path: url.pathname,
      method: req.method,
    });
    return;
  }
  const ifMatch = req.headers['if-match'];
  const baseRev =
    typeof body?.base_rev === 'number'
      ? body.base_rev
      : ifMatch
        ? Number(ifMatch.replace(/"/g, ''))
        : NaN;
  const changesetId = body?.changeset_id;
  const source = sanitizeSource(body?.source);
  const fields = body?.fields || {};
  try {
    const result = await store.applyPatch({
      productId,
      baseRev,
      fields,
      source,
      changesetId,
    });
    writeJson(res, 200, result, { 'x-correlation-id': requestId });
  } catch (error) {
    const status = error.statusCode || 500;
    const isServerError = status >= 500;
    const message = isServerError ? 'Internal Server Error' : error.message || 'Request failed';
    const code = isServerError ? 'INTERNAL_SERVER_ERROR' : 'SYNC_PATCH_REJECTED';
    writeError(
      res,
      status,
      {
        code,
        message,
        context: { method: req.method, path: url.pathname, productId },
        cause: isServerError ? error.message || null : null,
      },
      requestId
    );
    logApi(isServerError ? 'error' : 'warn', 'sync_api_patch_failed', {
      requestId,
      status,
      code,
      productId,
      path: url.pathname,
      method: req.method,
      cause: error,
    });
  }
}

async function handleChanges(store, req, res, url, requestId) {
  const sinceParam = url.searchParams.get('since_rev');
  const sinceRev = sinceParam ? Number(sinceParam) : 0;
  try {
    const payload = await store.getChangesSince(Number.isFinite(sinceRev) ? sinceRev : 0);
    writeJson(res, 200, payload, { 'x-correlation-id': requestId });
  } catch (error) {
    writeError(
      res,
      500,
      {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Internal Server Error',
        context: { method: req.method, path: url.pathname, since_rev: sinceRev },
        cause: error.message || null,
      },
      requestId
    );
    logApi('error', 'sync_api_changes_failed', {
      requestId,
      path: url.pathname,
      method: req.method,
      since_rev: sinceRev,
      cause: error,
    });
  }
}

function createServer(options = {}) {
  const dataPath = options.dataPath || path.join(__dirname, '..', 'data', 'product_data.json');
  const changeLogPath =
    options.changeLogPath || path.join(__dirname, '..', 'data', 'product_changes.json');
  const authConfig = resolveAuthConfig(options);
  const authMisconfigured = authConfig.requirePatchAuth && !authConfig.syncApiToken;
  if (authMisconfigured) {
    logApi('error', 'sync_api_auth_not_configured', {
      requirePatchAuth: authConfig.requirePatchAuth,
      strictAuthStartup: authConfig.strictAuthStartup,
      remediation: 'Set SYNC_API_TOKEN or disable auth requirement explicitly.',
    });
    if (authConfig.strictAuthStartup) {
      throw new Error('Sync API auth is required but SYNC_API_TOKEN is not configured');
    }
  }
  const store = new ProductStore({ dataPath, changeLogPath });

  const server = http.createServer(async (req, res) => {
    const requestId = normalizeCorrelationId(req.headers['x-correlation-id']) || createCorrelationId();
    let url;
    try {
      url = new URL(req.url || '/', 'http://localhost');
    } catch (error) {
      writeError(
        res,
        400,
        {
          code: 'INVALID_REQUEST_URL',
          message: 'Invalid request URL',
          context: { method: req.method || 'UNKNOWN', path: req.url || '/' },
          cause: null,
        },
        requestId
      );
      return;
    }

    if (req.method === 'PATCH' && url.pathname.startsWith('/api/products/')) {
      const authResult = authorizePatchRequest(req, authConfig);
      if (!authResult.ok) {
        writeError(
          res,
          authResult.statusCode,
          {
            code: authResult.code,
            message: authResult.message,
            context: { method: req.method, path: url.pathname },
            cause: null,
          },
          requestId
        );
        logApi('warn', 'sync_api_auth_rejected', {
          requestId,
          path: url.pathname,
          method: req.method,
          statusCode: authResult.statusCode,
          code: authResult.code,
        });
        return;
      }
      await handlePatch(store, req, res, url, requestId);
      return;
    }
    if (req.method === 'GET' && url.pathname === '/api/products/changes') {
      await handleChanges(store, req, res, url, requestId);
      return;
    }
    writeError(
      res,
      404,
      {
        code: 'NOT_FOUND',
        message: 'Not Found',
        context: { method: req.method || 'UNKNOWN', path: url.pathname },
        cause: null,
      },
      requestId
    );
  });

  return { server, store };
}

if (require.main === module) {
  const port = Number(process.env.PORT || 4000);
  const dataPath = process.env.PRODUCT_DATA_PATH;
  const changeLogPath = process.env.PRODUCT_CHANGE_LOG_PATH;
  const { server } = createServer({
    dataPath,
    changeLogPath,
  });
  server.listen(port, () => {
    console.log(`Product sync API listening on http://127.0.0.1:${port}`);
  });
}

module.exports = {
  createServer,
};
