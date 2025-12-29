const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');

(async () => {
  const mod = await import('../tools/lighthouse-audit.mjs');
  const { createStaticServer, getMimeType } = mod;

  // Sanity for MIME helper
  assert.strictEqual(getMimeType('x.css'), 'text/css; charset=utf-8');
  assert.strictEqual(getMimeType('x.woff2'), 'font/woff2');

  const tmpRoot = path.join(__dirname, 'tmp-static');
  fs.mkdirSync(tmpRoot, { recursive: true });
  fs.writeFileSync(path.join(tmpRoot, 'index.html'), '<h1>ok</h1>');

  const server = createStaticServer(tmpRoot);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  // 1) GET /index.html should be 200
  const okRes = await httpGet(`http://127.0.0.1:${port}/index.html`);
  assert.strictEqual(okRes.statusCode, 200);
  assert.match(okRes.body, /<h1>ok<\/h1>/);
  assert.match(okRes.headers['content-type'], /text\/html/);

  // 2) Path traversal should be blocked
  const trav = await httpGet(`http://127.0.0.1:${port}/../package.json`);
  assert.strictEqual(trav.statusCode, 403);

  // 3) Method restriction
  const postRes = await httpRequest(`http://127.0.0.1:${port}/index.html`, 'POST');
  assert.strictEqual(postRes.statusCode, 405);
  assert.strictEqual(postRes.headers['allow'], 'GET, HEAD');

  await new Promise((resolve) => server.close(resolve));

  console.log('tools.staticServer.security.test.js passed');
})();

function httpGet(url) {
  return httpRequest(url, 'GET');
}

function httpRequest(url, method) {
  const requestOptions = normalizeLocalUrl(url);
  return new Promise((resolve, reject) => {
    const req = http.request({ ...requestOptions, method }, (res) => {
      let chunks = '';
      res.setEncoding('utf8');
      res.on('data', (d) => (chunks += d));
      res.on('end', () =>
        resolve({ statusCode: res.statusCode, headers: res.headers, body: chunks })
      );
    });
    req.on('error', reject);
    req.end();
  });
}

function normalizeLocalUrl(rawUrl) {
  const url = rawUrl instanceof URL ? rawUrl : new URL(rawUrl);
  if (url.protocol !== 'http:') {
    throw new Error(`Unsupported protocol: ${url.protocol}`);
  }
  const allowedHosts = new Set(['127.0.0.1', 'localhost']);
  if (!allowedHosts.has(url.hostname)) {
    throw new Error(`Disallowed host: ${url.hostname}`);
  }
  const port = url.port ? Number(url.port) : 80;
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid port: ${url.port}`);
  }
  const path = `${url.pathname}${url.search}`;
  return {
    hostname: url.hostname,
    port,
    path,
  };
}
