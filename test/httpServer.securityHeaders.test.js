'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

const { createServer } = require('../server/httpServer');

const REQUIRED_SECURITY_HEADERS = [
  'x-content-type-options',
  'x-frame-options',
  'referrer-policy',
  'cross-origin-resource-policy',
  'content-security-policy',
  'cache-control',
  'pragma',
];

async function createTempDataFiles() {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'http-server-security-'));
  const dataPath = path.join(tmpDir, 'product_data.json');
  const changeLogPath = path.join(tmpDir, 'product_changes.json');

  const baseData = {
    version: '20250201-000000',
    last_updated: '2025-02-01T00:00:00.000Z',
    rev: 0,
    products: [
      {
        name: 'Widget',
        description: '',
        price: 1000,
        discount: 0,
        stock: true,
        category: 'Default',
        image_path: '',
        image_avif_path: '',
        order: 0,
        rev: 0,
        field_last_modified: {},
      },
    ],
  };

  await fs.writeFile(dataPath, JSON.stringify(baseData, null, 2));
  return { tmpDir, dataPath, changeLogPath };
}

function requestJson(port, method, pathName, body, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? Buffer.from(JSON.stringify(body)) : null;
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: pathName,
        method,
        headers: payload
          ? {
              'content-type': 'application/json',
              'content-length': String(payload.length),
              ...extraHeaders,
            }
          : { ...extraHeaders },
      },
      (res) => {
        let raw = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          raw += chunk;
        });
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: raw,
          });
        });
      }
    );
    req.on('error', reject);
    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

test('http sync server applies security headers to JSON responses', async () => {
  const { dataPath, changeLogPath, tmpDir } = await createTempDataFiles();
  const { server } = createServer({ dataPath, changeLogPath });

  try {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();

    const okResponse = await requestJson(port, 'GET', '/api/products/changes?since_rev=0');
    assert.equal(okResponse.statusCode, 200);
    assert.match(okResponse.headers['content-type'] || '', /application\/json/);
    assert.ok(okResponse.headers['x-correlation-id']);

    for (const headerName of REQUIRED_SECURITY_HEADERS) {
      assert.ok(okResponse.headers[headerName], `Missing header: ${headerName}`);
    }

    const notFound = await requestJson(port, 'GET', '/not-found');
    assert.equal(notFound.statusCode, 404);
    assert.ok(notFound.headers['x-correlation-id']);
    const notFoundPayload = JSON.parse(notFound.body);
    assert.equal(notFoundPayload.code, 'NOT_FOUND');
    assert.equal(notFoundPayload.message, 'Not Found');
    assert.equal(notFoundPayload.error, 'Not Found');
    assert.equal(notFoundPayload.cause, null);
    assert.equal(notFoundPayload.context.path, '/not-found');

    for (const headerName of REQUIRED_SECURITY_HEADERS) {
      assert.ok(notFound.headers[headerName], `Missing header on 404: ${headerName}`);
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('http sync server returns 400 for invalid encoded product id and 413 for oversized payload', async () => {
  const { dataPath, changeLogPath, tmpDir } = await createTempDataFiles();
  const { server } = createServer({ dataPath, changeLogPath });

  try {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();

    const malformedId = await requestJson(
      port,
      'PATCH',
      '/api/products/%E0%A4%A',
      {
        base_rev: 0,
        source: 'offline',
        changeset_id: 'bad-id',
        fields: { price: 1200 },
      },
      { 'x-correlation-id': 'cid-manual-123' }
    );
    assert.equal(malformedId.statusCode, 400);
    assert.equal(malformedId.headers['x-correlation-id'], 'cid-manual-123');
    const malformedPayload = JSON.parse(malformedId.body);
    assert.equal(malformedPayload.code, 'INVALID_PRODUCT_IDENTIFIER');
    assert.equal(malformedPayload.message, 'Invalid product identifier');
    assert.equal(malformedPayload.error, malformedPayload.message);
    assert.equal(malformedPayload.cause, null);
    assert.equal(malformedPayload.context.path, '/api/products/%E0%A4%A');

    const largeValue = 'a'.repeat(1_000_200);
    const tooLarge = await requestJson(port, 'PATCH', '/api/products/Widget', {
      base_rev: 0,
      source: 'offline',
      changeset_id: 'too-large',
      fields: { description: largeValue },
    });
    assert.equal(tooLarge.statusCode, 413);
    assert.ok(tooLarge.headers['x-correlation-id']);
    const tooLargePayload = JSON.parse(tooLarge.body);
    assert.equal(tooLargePayload.code, 'PAYLOAD_TOO_LARGE');
    assert.equal(tooLargePayload.message, 'Payload too large');
    assert.equal(tooLargePayload.error, tooLargePayload.message);
    assert.equal(tooLargePayload.cause, null);
    assert.equal(tooLargePayload.context.path, '/api/products/Widget');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('http sync server requires bearer auth when patch auth is enabled', async () => {
  const { dataPath, changeLogPath, tmpDir } = await createTempDataFiles();
  const { server } = createServer({
    dataPath,
    changeLogPath,
    requirePatchAuth: true,
    syncApiToken: 'sync-token-123',
  });

  try {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    const payload = {
      base_rev: 0,
      source: 'offline',
      changeset_id: 'auth-check-1',
      fields: { price: 1200 },
    };

    const missingAuth = await requestJson(port, 'PATCH', '/api/products/Widget', payload);
    assert.equal(missingAuth.statusCode, 401);
    const missingAuthBody = JSON.parse(missingAuth.body);
    assert.equal(missingAuthBody.code, 'UNAUTHORIZED');
    assert.equal(missingAuthBody.message, 'Unauthorized');
    assert.equal(missingAuthBody.cause, null);

    const invalidAuth = await requestJson(
      port,
      'PATCH',
      '/api/products/Widget',
      payload,
      { authorization: 'Bearer bad-token' }
    );
    assert.equal(invalidAuth.statusCode, 401);
    const invalidAuthBody = JSON.parse(invalidAuth.body);
    assert.equal(invalidAuthBody.code, 'UNAUTHORIZED');

    const authorized = await requestJson(
      port,
      'PATCH',
      '/api/products/Widget',
      payload,
      {
        authorization: 'Bearer sync-token-123',
        'x-correlation-id': 'cid-auth-accept',
      }
    );
    assert.equal(authorized.statusCode, 200);
    assert.equal(authorized.headers['x-correlation-id'], 'cid-auth-accept');
    const authorizedBody = JSON.parse(authorized.body);
    assert.equal(authorizedBody.product.price, 1200);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('http sync server fails closed when auth is required but token is not configured', async () => {
  const { dataPath, changeLogPath, tmpDir } = await createTempDataFiles();
  const { server } = createServer({
    dataPath,
    changeLogPath,
    requirePatchAuth: true,
    syncApiToken: '   ',
  });

  try {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    const response = await requestJson(port, 'PATCH', '/api/products/Widget', {
      base_rev: 0,
      source: 'offline',
      changeset_id: 'auth-check-2',
      fields: { price: 1300 },
    });

    assert.equal(response.statusCode, 503);
    const body = JSON.parse(response.body);
    assert.equal(body.code, 'SYNC_AUTH_NOT_CONFIGURED');
    assert.equal(body.message, 'Sync API authentication is not configured');
    assert.equal(body.cause, null);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('http sync server can fail fast at startup when strict auth startup is enabled', async () => {
  const { dataPath, changeLogPath, tmpDir } = await createTempDataFiles();
  try {
    assert.throws(
      () =>
        createServer({
          dataPath,
          changeLogPath,
          requirePatchAuth: true,
          syncApiToken: '',
          strictAuthStartup: true,
        }),
      /SYNC_API_TOKEN|auth/i
    );
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});
