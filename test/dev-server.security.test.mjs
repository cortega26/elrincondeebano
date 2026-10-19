import assert from 'assert';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEV_SERVER = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'scripts',
  'dev-server.mjs'
);

test('dev server path containment', async () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'dev-server-security-'));
  const rootDir = path.join(base, 'el-rincon-de-ebano');
  const siblingDir = path.join(base, 'el-rincon-de-ebano-backup');
  fs.mkdirSync(rootDir, { recursive: true });
  fs.mkdirSync(siblingDir, { recursive: true });
  fs.writeFileSync(path.join(rootDir, 'index.html'), '<h1>ok</h1>');
  fs.writeFileSync(path.join(rootDir, 'hello.txt'), 'INSIDE');
  fs.writeFileSync(path.join(siblingDir, 'secret.txt'), 'SIBLING-SECRET');
  fs.symlinkSync(siblingDir, path.join(rootDir, 'link-out'));
  fs.symlinkSync(path.join(siblingDir, 'secret.txt'), path.join(rootDir, 'link-file.txt'));

  // Plan 278: PORT=0 binds an OS-assigned ephemeral port, so parallel test
  // workers can never collide on a pseudo-random fixed port (EADDRINUSE).
  const stderrChunks = [];
  const child = spawn(process.execPath, [DEV_SERVER, rootDir], {
    env: { ...process.env, PORT: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stderr.on('data', (chunk) => stderrChunks.push(chunk));
  let started = false;
  try {
    const port = await waitForServerPort(child, () => Buffer.concat(stderrChunks).toString());
    started = true;

    // (d) A normal file inside the root still serves.
    const ok = await httpGet(`http://127.0.0.1:${port}/hello.txt`);
    assert.strictEqual(ok.statusCode, 200);
    assert.strictEqual(ok.body, 'INSIDE');

    const html = await httpGet(`http://127.0.0.1:${port}/index.html`);
    assert.strictEqual(html.statusCode, 200);
    assert.match(html.headers['content-type'], /text\/html/);

    // (b) Percent-encoded `..` (encoded slash keeps the raw segment intact
    // through URL parsing) must be rejected — previously served sibling content.
    const encUp = await httpGet(
      `http://127.0.0.1:${port}/%2e%2e%2fel-rincon-de-ebano-backup/secret.txt`
    );
    assert.strictEqual(encUp.statusCode, 403);

    const mixedUp = await httpGet(
      `http://127.0.0.1:${port}/..%2fel-rincon-de-ebano-backup/secret.txt`
    );
    assert.strictEqual(mixedUp.statusCode, 403);

    const doubleUp = await httpGet(
      `http://127.0.0.1:${port}/%2e%2e%2f%2e%2e%2fel-rincon-de-ebano-backup/secret.txt`
    );
    assert.strictEqual(doubleUp.statusCode, 403);

    // (a) Sibling-prefix traversal. Raw `..` is normalized away by the URL
    // parser before reaching the server, so it must never return sibling
    // content either.
    const rawUp = await httpGet(`http://127.0.0.1:${port}/../el-rincon-de-ebano-backup/secret.txt`);
    assert.notStrictEqual(rawUp.statusCode, 200);
    assert.ok(!rawUp.body.includes('SIBLING-SECRET'));

    // (c) A symlink inside the served tree pointing outside must not stream.
    const symlinkDir = await httpGet(`http://127.0.0.1:${port}/link-out/secret.txt`);
    assert.notStrictEqual(symlinkDir.statusCode, 200);
    assert.ok(!symlinkDir.body.includes('SIBLING-SECRET'));

    const symlinkFile = await httpGet(`http://127.0.0.1:${port}/link-file.txt`);
    assert.notStrictEqual(symlinkFile.statusCode, 200);
    assert.ok(!symlinkFile.body.includes('SIBLING-SECRET'));

    console.log('dev-server.security.test.mjs passed');
  } finally {
    child.kill();
    if (!started) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    fs.rmSync(base, { recursive: true, force: true });
  }
}, 15000);

// Waits for the server's startup line, which now reports the real bound port
// (scripts/dev-server.mjs). No blind polling: the line is logged from the
// `listen` callback, so the server is already accepting connections.
function waitForServerPort(child, readStderr) {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let settled = false;
    const timer = setTimeout(() => {
      settle(reject, new Error(`dev server did not report its port within 10s.\n${readStderr()}`));
    }, 10000);

    function settle(callback, value) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.stdout.off('data', onStdout);
      child.off('exit', onExit);
      child.off('error', onError);
      callback(value);
    }

    function onStdout(chunk) {
      stdout += chunk;
      const match = stdout.match(/Static server running at http:\/\/127\.0\.0\.1:(\d+)/);
      if (match) settle(resolve, Number(match[1]));
    }

    function onExit(code, signal) {
      settle(
        reject,
        new Error(
          `dev server exited before listening (code=${code}, signal=${signal}).\n${readStderr()}`
        )
      );
    }

    function onError(error) {
      settle(reject, error);
    }

    child.stdout.on('data', onStdout);
    child.on('exit', onExit);
    child.on('error', onError);
  });
}

function httpGet(url) {
  return fetch(url).then(async (res) => ({
    statusCode: res.status,
    headers: Object.fromEntries(res.headers.entries()),
    body: await res.text(),
  }));
}
