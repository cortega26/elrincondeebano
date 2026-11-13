import { test, expect } from 'vitest';
import { createApp } from '../../src/server/app.ts';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';

// Audit fix: the SPA emits image srcs with spaces/unicode; the server must
// serve them decoded (never fall back to the SPA HTML for missing assets).
function createTempDir(): string {
  return resolve(tmpdir(), `cm-assets-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
}

test('assets with spaces and unicode are served as real files', async () => {
  const dir = createTempDir();
  try {
    mkdirSync(resolve(dir, 'assets', 'images', 'limpieza_y_aseo'), { recursive: true });
    writeFileSync(
      resolve(dir, 'assets', 'images', 'limpieza_y_aseo', 'Nova Clásica 2x14m.webp'),
      'RIFFWEBPFAKE'
    );
    // The static web handler (and the assets route) only register when a
    // built SPA exists — give the fixture a minimal one.
    mkdirSync(resolve(dir, 'admin', 'content-manager', 'dist', 'web'), { recursive: true });
    writeFileSync(
      resolve(dir, 'admin', 'content-manager', 'dist', 'web', 'index.html'),
      '<html>spa</html>'
    );

    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();

    const encoded = '/assets/images/limpieza_y_aseo/Nova%20Cl%C3%A1sica%202x14m.webp';
    const res = await app.inject({ method: 'GET', url: encoded });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('image/webp');
    expect(res.body).toBe('RIFFWEBPFAKE');

    // Missing assets 404 — they must NOT fall back to the SPA HTML.
    const missing = await app.inject({
      method: 'GET',
      url: '/assets/images/limpieza_y_aseo/does-not-exist.webp',
    });
    expect(missing.statusCode).toBe(404);

    // SPA bundles (dist/web/assets) must keep serving — a 404 here blanks
    // the whole app. Regression guard for the repo-root assets lookup.
    mkdirSync(resolve(dir, 'admin', 'content-manager', 'dist', 'web', 'assets'), {
      recursive: true,
    });
    writeFileSync(
      resolve(dir, 'admin', 'content-manager', 'dist', 'web', 'assets', 'index-AbC123.js'),
      'console.log("spa-bundle")'
    );
    const bundle = await app.inject({
      method: 'GET',
      url: '/assets/index-AbC123.js',
    });
    expect(bundle.statusCode).toBe(200);
    expect(bundle.headers['content-type']).toContain('javascript');
    expect(bundle.body).toContain('spa-bundle');

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('traversal variants never serve files outside the repo (plan 090)', async () => {
  const dir = createTempDir();
  try {
    mkdirSync(resolve(dir, 'assets'), { recursive: true });
    mkdirSync(resolve(dir, 'admin', 'content-manager', 'dist', 'web'), { recursive: true });
    writeFileSync(
      resolve(dir, 'admin', 'content-manager', 'dist', 'web', 'index.html'),
      '<html>spa</html>'
    );
    writeFileSync(resolve(dir, 'secret.txt'), 'SECRET-DO-NOT-SERVE');

    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();

    // The router normalizes `..` before the handler (SPA fallback 200) or the
    // handler rejects it — either way the secret file must NEVER be served.
    for (const url of [
      '/assets/%2e%2e/secret.txt',
      '/assets/../secret.txt',
      '/assets/%2e%2e/%2e%2e/secret.txt',
      '/%2e%2e/secret.txt',
      '/assets/..%2fsecret.txt',
    ]) {
      const res = await app.inject({ method: 'GET', url });
      expect([200, 404], url).toContain(res.statusCode);
      expect(res.body, url).not.toContain('SECRET-DO-NOT-SERVE');
    }

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('dev launcher redirects to the Vite SPA when dist/web is absent', async () => {
  const dir = createTempDir();
  try {
    const app = createApp({
      repoRoot: dir,
      enableWrites: false,
      logger: false,
      devWebOrigin: 'http://127.0.0.1:5173',
    });
    await app.ready();

    // `admin:dev` opens the browser at :3000; with no built SPA the server
    // forwards to the Vite origin instead of answering 404. The target is the
    // validated origin constant (never the request path) to avoid an open
    // redirect.
    const root = await app.inject({ method: 'GET', url: '/?http=on' });
    expect(root.statusCode).toBe(302);
    expect(root.headers.location).toBe('http://127.0.0.1:5173');

    const deep = await app.inject({ method: 'GET', url: '/products' });
    expect(deep.statusCode).toBe(302);
    expect(deep.headers.location).toBe('http://127.0.0.1:5173');

    // API routes keep priority over the dev wildcard.
    const health = await app.inject({ method: 'GET', url: '/api/v1/health' });
    expect(health.statusCode).toBe(200);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('repo-root assets are served before a SPA build exists (admin:dev)', async () => {
  const dir = createTempDir();
  try {
    mkdirSync(resolve(dir, 'assets', 'images', 'web'), { recursive: true });
    writeFileSync(resolve(dir, 'assets', 'images', 'web', 'logo.webp'), 'RIFFWEBP');
    const app = createApp({
      repoRoot: dir,
      enableWrites: false,
      logger: false,
      devWebOrigin: 'http://127.0.0.1:5173',
    });
    await app.ready();

    // Vite proxies /assets here; images must load even though dist/web has
    // never been built. Missing files still 404 (never SPA/redirect HTML).
    const image = await app.inject({ method: 'GET', url: '/assets/images/web/logo.webp' });
    expect(image.statusCode).toBe(200);
    expect(image.headers['content-type']).toContain('image/webp');
    expect(image.body).toBe('RIFFWEBP');

    const missing = await app.inject({ method: 'GET', url: '/assets/images/web/nope.webp' });
    expect(missing.statusCode).toBe(404);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('dev redirect only accepts exact loopback HTTP origins', () => {
  const dir = createTempDir();
  try {
    for (const devWebOrigin of [
      'not-a-url',
      'https://127.0.0.1:5173',
      'http://192.168.1.10:5173',
      'http://127.0.0.1:5173/app',
      'http://user:pass@127.0.0.1:5173',
    ]) {
      expect(() => createApp({ repoRoot: dir, logger: false, devWebOrigin }), devWebOrigin).toThrow(
        /ADMIN_DEV_WEB_ORIGIN/
      );
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
