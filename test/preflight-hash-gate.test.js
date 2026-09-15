// Plan 013 Step 3: hash-gated parallel preflight helpers.
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runCommandsParallel } from '../tools/run-parallel.mjs';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');

describe('run-parallel failure propagation', () => {
  it('reports all-ok when every command succeeds', async () => {
    const results = await runCommandsParallel([
      `${process.execPath} -e "process.exit(0)"`,
      `${process.execPath} -e "process.exit(0)"`,
    ]);
    expect(results.map((r) => r.code)).toEqual([0, 0]);
  });

  it('surfaces the failing command instead of swallowing it', async () => {
    const results = await runCommandsParallel([
      `${process.execPath} -e "process.exit(0)"`,
      `${process.execPath} -e "process.exit(3)"`,
    ]);
    expect(results.find((r) => r.code === 3)?.command).toContain('exit(3)');
  });
});

describe('preflight full chain preserved', () => {
  it('preflight still runs every step (parallelized, none dropped)', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
    const preflight = pkg.scripts.preflight;
    for (const step of [
      'categories:sync',
      'images:logo',
      'images:avif',
      'images:og:home',
      'images:og:overrides',
      'images:og:categories',
      'images:og:parking',
      'images:og:clean-overrides',
      'gap-fill',
      'migrate-catalog',
      'tools/preflight.js',
    ]) {
      expect(preflight).toContain(step);
    }
    // Ordering invariants: sync first, overrides before categories,
    // validation last.
    expect(preflight.indexOf('categories:sync')).toBeLessThan(preflight.indexOf('images:logo'));
    expect(preflight.indexOf('images:og:overrides')).toBeLessThan(
      preflight.indexOf('images:og:categories')
    );
    expect(preflight.lastIndexOf('tools/preflight.js')).toBeGreaterThan(
      preflight.indexOf('images:gap-fill')
    );
  });

  it('build:fast exists as the documented inner-loop default', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
    expect(pkg.scripts['build:fast']).toBe('npm -w astro-poc run build');
    const readme = fs.readFileSync(path.join(REPO_ROOT, 'README.md'), 'utf8');
    expect(readme).toContain('npm run build:fast');
  });
});

describe('preflight-hash gate decisions', () => {
  let dir;
  let prevCwd;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hash-gate-'));
    prevCwd = process.cwd();
  });

  afterEach(() => {
    process.chdir(prevCwd);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  // The gate module pins REPO_ROOT at import time, so exercise its pure
  // decision inputs here (hash stability) with a local reimplementation of
  // the state round-trip contract: state file holds the input hash.
  it('hashes are stable for identical inputs', async () => {
    const { hashInputFiles } = await import('../tools/preflight-hash.mjs');
    void hashInputFiles;
    // Operate inside the real repo (module root): hash two pinned files twice.
    const h1 = hashInputFiles(['package.json']);
    const h2 = hashInputFiles(['package.json']);
    expect(h1).toBeTruthy();
    expect(h1).toBe(h2);
    expect(hashInputFiles(['does/not/exist-013.json'])).toBeNull();
  });

  it('gate skips only when inputs unchanged and outputs exist', async () => {
    const { shouldSkipStep } = await import('../tools/preflight-hash.mjs');
    // package.json exists in repo root; fake outputs control the branch.
    const missing = shouldSkipStep(
      'no-such-step-013',
      ['package.json'],
      ['does/not/exist-013.png']
    );
    expect(missing.skip).toBe(false);
    expect(['inputs-changed', 'outputs-missing']).toContain(missing.reason);
  });

  it('a read race between stat and read forces a run instead of crashing (plan 181)', async () => {
    const mod = await import('../tools/preflight-hash.mjs');
    // Synchronous window: no other test can interleave while patched.
    // Patch both read entry points so the test pins the contract (race ->
    // null), not the implementation (buffered vs streaming reads).
    const fs = (await import('node:fs')).default;
    const origReadFile = fs.readFileSync;
    const origRead = fs.readSync;
    fs.readFileSync = () => {
      throw new Error('EIO vanish');
    };
    fs.readSync = () => {
      throw new Error('EIO vanish');
    };
    try {
      expect(mod.hashInputFiles(['package.json'])).toBeNull();
    } finally {
      fs.readFileSync = origReadFile;
      fs.readSync = origRead;
    }
  });

  it('step names are confined to [A-Za-z0-9-_] (plan 181)', async () => {
    const { assertSafeStepName, readStepState } = await import('../tools/preflight-hash.mjs');
    expect(assertSafeStepName('images-logo')).toBe('images-logo');
    expect(assertSafeStepName('images-og_home-2')).toBe('images-og_home-2');
    expect(() => assertSafeStepName('../evil')).toThrow(/Invalid step name/);
    expect(() => assertSafeStepName('a/b')).toThrow(/Invalid step name/);
    expect(() => assertSafeStepName('')).toThrow(/Invalid step name/);
    expect(() => readStepState('../evil')).toThrow(/Invalid step name/);
  });
});

describe('runTasksBounded worker pool (plan 186)', () => {
  it('preserves input order and respects the concurrency bound', async () => {
    const { runTasksBounded } = await import('../tools/run-parallel.mjs');
    let inFlight = 0;
    let maxInFlight = 0;
    const tasks = Array.from({ length: 10 }, (_, i) => async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return i * 2;
    });
    const results = await runTasksBounded(tasks, 3);
    expect(results).toEqual([0, 2, 4, 6, 8, 10, 12, 14, 16, 18]);
    expect(maxInFlight).toBeLessThanOrEqual(3);
    expect(maxInFlight).toBeGreaterThan(1);
  });

  it('fails fast with the first error after in-flight tasks settle', async () => {
    const { runTasksBounded } = await import('../tools/run-parallel.mjs');
    const settled = [];
    const tasks = [
      async () => {
        settled.push('ok');
        return 'ok';
      },
      async () => {
        settled.push('boom');
        throw new Error('boom');
      },
    ];
    await expect(runTasksBounded(tasks, 2)).rejects.toThrow('boom');
    expect(settled.sort()).toEqual(['boom', 'ok']);
  });

  it('handles empty lists and serial limit 1', async () => {
    const { runTasksBounded } = await import('../tools/run-parallel.mjs');
    expect(await runTasksBounded([], 4)).toEqual([]);
    const order = [];
    await runTasksBounded(
      [1, 2, 3].map((n) => async () => {
        order.push(n);
        return n;
      }),
      1
    );
    expect(order).toEqual([1, 2, 3]);
  });
});
