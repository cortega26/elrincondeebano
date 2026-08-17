#!/usr/bin/env node
import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootArg = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(__dirname, '..');
const rootDir = rootArg;
const port = Number(process.env.PORT || 8080);
const CONTENT_TYPE_HEADER = 'content-type';
const PLAIN_TEXT_CONTENT_TYPE = 'text/plain; charset=utf-8';

const mimeTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'application/javascript; charset=utf-8'],
  ['.mjs', 'application/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.webp', 'image/webp'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.svg', 'image/svg+xml'],
  ['.woff2', 'font/woff2'],
  ['.woff', 'font/woff'],
  ['.ico', 'image/x-icon'],
]);

function resolvePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  let pathname = decoded;
  if (pathname.endsWith('/')) {
    pathname = path.join(pathname, 'index.html');
  }
  // Plan 132: reject any decoded parent segment before resolving —
  // path.join() collapses `..` BEFORE a containment check could see it
  // (mirrors src/server/app.ts, Plan 090).
  if (pathname.split('/').includes('..')) {
    return null;
  }
  const resolved = path.join(rootDir, pathname);
  // Boundary-aware containment by segment, not string prefix (matches
  // src/shared/identity.ts isContainedWithin convention).
  if (resolved !== rootDir && !resolved.startsWith(rootDir + path.sep)) {
    return null;
  }
  return resolved;
}

function sendTextResponse(res, statusCode, message) {
  res.statusCode = statusCode;
  res.setHeader(CONTENT_TYPE_HEADER, PLAIN_TEXT_CONTENT_TYPE);
  res.end(message);
}

function sendNotFound(res) {
  sendTextResponse(res, 404, 'Not Found');
}

const server = http.createServer(async (req, res) => {
  try {
    const { method, url } = req;
    if (!url || (method !== 'GET' && method !== 'HEAD')) {
      sendTextResponse(res, 405, 'Method Not Allowed');
      return;
    }

    const filePath = resolvePath(new URL(url, `http://localhost:${port}`).pathname);
    if (!filePath) {
      sendTextResponse(res, 403, 'Forbidden');
      return;
    }

    const fileStat = await stat(filePath).catch(() => null);
    if (!fileStat || fileStat.isDirectory()) {
      sendNotFound(res);
      return;
    }

    // Plan 132: stat() follows symlinks — realpath the file and re-apply the
    // containment check so links that point outside rootDir return 404
    // instead of streaming out-of-tree content.
    const realPath = await realpath(filePath);
    if (realPath !== rootDir && !realPath.startsWith(rootDir + path.sep)) {
      sendNotFound(res);
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const type = mimeTypes.get(ext) || 'application/octet-stream';
    res.statusCode = 200;
    res.setHeader(CONTENT_TYPE_HEADER, type);
    res.setHeader('cache-control', 'no-cache');

    if (method === 'HEAD') {
      res.end();
      return;
    }

    createReadStream(filePath).pipe(res);
  } catch (error) {
    console.error('[dev-server] error serving request:', error);
    sendTextResponse(res, 500, 'Internal Server Error');
  }
});

server.listen(port, () => {
  console.log(`Static server running at http://127.0.0.1:${port} from ${rootDir}`);
});
