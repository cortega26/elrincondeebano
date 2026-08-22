import { test, expect, vi, afterEach } from 'vitest';
import { createApp } from '../../src/server/app.ts';
import { SyncService } from '../../src/server/services/syncService.ts';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';

const setupRepo = () => {
  const dir = resolve(
    tmpdir(),
    `cm-sync-interval-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );
  mkdirSync(resolve(dir, 'data'), { recursive: true });
  // Minimal sync config that makes SyncAdapter.isConfigured true (loopback http allowed)
  writeFileSync(
    resolve(dir, 'data', 'sync-config.json'),
    JSON.stringify({
      enabled: true,
      api_base: 'http://127.0.0.1:9',
      poll_interval: 60,
      pull_interval: 300,
      timeout: 1,
    })
  );
  mkdirSync(resolve(dir, 'assets', 'images'), { recursive: true });
  writeFileSync(
    resolve(dir, 'data', 'category_registry.json'),
    JSON.stringify({ nav_groups: [], categories: [] })
  );
  writeFileSync(
    resolve(dir, 'data', 'product_data.json'),
    JSON.stringify({ version: 'test', last_updated: '', rev: 1, products: [] })
  );
  return dir;
};

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

test('sync interval catches processOnce rejection and keeps server alive (plan 136)', async () => {
  const dir = setupRepo();
  const lines: string[] = [];
  const stream = {
    write: (line: string) => {
      lines.push(line);
      return true;
    },
  };

  // Track unhandled rejections — should stay empty on Node 24 throw mode.
  const unhandled: unknown[] = [];
  const handler = (reason: unknown) => unhandled.push(reason);
  process.on('unhandledRejection', handler);

  // Force the interval body to hit the catch path.
  const processSpy = vi
    .spyOn(SyncService.prototype, 'processOnce')
    .mockRejectedValue(new Error('interval boom'));
  const pullSpy = vi
    .spyOn(SyncService.prototype, 'pullOnce')
    .mockResolvedValue({ applied: 0, cursor: 1 } as never);

  vi.useFakeTimers();

  const app = createApp({ repoRoot: dir, enableWrites: true, logger: { level: 'error', stream } });
  await app.ready();

  // Health should work before the interval fires.
  const before = await app.inject({ method: 'GET', url: '/api/v1/health' });
  expect(before.statusCode).toBe(200);

  // Fire the 60s interval (and flush the async handler).
  await vi.advanceTimersByTimeAsync(60_000);
  // Give any pending microtasks a tick.
  await Promise.resolve();

  // The interval should have called processOnce and logged the error, not crashed.
  expect(processSpy).toHaveBeenCalled();
  // pullOnce should not have been called because processOnce rejected sequentially.
  expect(pullSpy).not.toHaveBeenCalled();

  const hasLog = lines.some((l) => l.includes('sync interval failed'));
  expect(hasLog).toBe(true);
  expect(unhandled.length).toBe(0);

  // Server is still alive — subsequent request succeeds.
  const after = await app.inject({ method: 'GET', url: '/api/v1/health' });
  expect(after.statusCode).toBe(200);
  expect(after.headers['x-request-id']).toBeTruthy();

  // Second tick should also be caught (retry after rejection still logged).
  await vi.advanceTimersByTimeAsync(60_000);
  await Promise.resolve();
  expect(processSpy).toHaveBeenCalledTimes(2);

  await app.close();

  process.off('unhandledRejection', handler);
  vi.useRealTimers();
  vi.restoreAllMocks();
  rmSync(dir, { recursive: true, force: true });
});

test('sync interval catches pullOnce rejection as well', async () => {
  const dir = setupRepo();
  const lines: string[] = [];
  const stream = {
    write: (line: string) => {
      lines.push(line);
      return true;
    },
  };

  const unhandled: unknown[] = [];
  const handler = (reason: unknown) => unhandled.push(reason);
  process.on('unhandledRejection', handler);

  vi.spyOn(SyncService.prototype, 'processOnce').mockResolvedValue({
    pushed: 0,
    failed: 0,
  } as never);
  const pullSpy = vi
    .spyOn(SyncService.prototype, 'pullOnce')
    .mockRejectedValue(new Error('pull boom'));

  vi.useFakeTimers();

  const app = createApp({ repoRoot: dir, enableWrites: true, logger: { level: 'error', stream } });
  await app.ready();

  await vi.advanceTimersByTimeAsync(60_000);
  await Promise.resolve();

  expect(pullSpy).toHaveBeenCalled();
  const hasLog = lines.some((l) => l.includes('sync interval failed'));
  expect(hasLog).toBe(true);
  expect(unhandled.length).toBe(0);

  const res = await app.inject({ method: 'GET', url: '/api/v1/health' });
  expect(res.statusCode).toBe(200);

  await app.close();
  process.off('unhandledRejection', handler);
  vi.useRealTimers();
  vi.restoreAllMocks();
  rmSync(dir, { recursive: true, force: true });
});

test('onClose clears sync interval and shuts down job timers (plan 136)', async () => {
  const dir = setupRepo();
  // Use a manual clock for the runner to verify shutdown clears its timers,
  // but here we verify the app-level hook: timers must not fire after close.
  const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
  await app.ready();

  // app.close() should not hang (timers cleared, jobRunner shutdown).
  // If syncTimer were not cleared, the event loop would keep the process alive
  // and vitest would timeout on the next tick; if jobRunner timers leaked,
  // shutdown would not be awaited. We just assert close completes quickly.
  const start = Date.now();
  await app.close();
  const elapsed = Date.now() - start;
  expect(elapsed).toBeLessThan(2000);

  rmSync(dir, { recursive: true, force: true });
});
