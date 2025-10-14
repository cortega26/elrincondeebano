'use strict';

const http = require('node:http');
const path = require('node:path');
const { URL } = require('node:url');
const { ProductStore } = require('./productStore');

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => {
      chunks.push(chunk);
      if (chunks.reduce((acc, item) => acc + item.length, 0) > 1e6) {
        reject(new Error('Payload too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!chunks.length) {
        resolve(null);
        return;
      }
      const raw = Buffer.concat(chunks).toString('utf8');
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(new Error('Invalid JSON payload'));
      }
    });
    req.on('error', reject);
  });
}

function sanitizeSource(value) {
  if (value === 'admin' || value === 'offline') {
    return value;
  }
  return 'admin';
}

async function handlePatch(store, req, res, url) {
  const productId = decodeURIComponent(url.pathname.replace('/api/products/', ''));
  let body;
  try {
    body = await readBody(req);
  } catch (error) {
    res.writeHead(400, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: error.message }));
    return;
  }
  const ifMatch = req.headers['if-match'];
  const baseRev = typeof body?.base_rev === 'number'
    ? body.base_rev
    : (ifMatch ? Number(ifMatch.replace(/"/g, '')) : NaN);
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
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(result));
  } catch (error) {
    const status = error.statusCode || 500;
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: error.message || 'Internal Server Error' }));
  }
}

async function handleChanges(store, req, res, url) {
  const sinceParam = url.searchParams.get('since_rev');
  const sinceRev = sinceParam ? Number(sinceParam) : 0;
  try {
    const payload = await store.getChangesSince(Number.isFinite(sinceRev) ? sinceRev : 0);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(payload));
  } catch (error) {
    res.writeHead(500, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: error.message || 'Internal Server Error' }));
  }
}

function createServer(options = {}) {
  const dataPath = options.dataPath || path.join(__dirname, '..', 'data', 'product_data.json');
  const changeLogPath = options.changeLogPath || path.join(__dirname, '..', 'data', 'product_changes.json');
  const store = new ProductStore({ dataPath, changeLogPath });

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    if (req.method === 'PATCH' && url.pathname.startsWith('/api/products/')) {
      await handlePatch(store, req, res, url);
      return;
    }
    if (req.method === 'GET' && url.pathname === '/api/products/changes') {
      await handleChanges(store, req, res, url);
      return;
    }
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not Found' }));
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
    // eslint-disable-next-line no-console
    console.log(`Product sync API listening on http://127.0.0.1:${port}`);
  });
}

module.exports = {
  createServer,
};
