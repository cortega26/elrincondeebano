import { test, expect } from 'vitest';
import { createApp } from '../../src/server/app.ts';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';

function createTempDir(): string {
  return resolve(
    tmpdir(),
    `cm-diagnostics-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );
}

function setup(dir: string): void {
  mkdirSync(resolve(dir, 'data'), { recursive: true });
  mkdirSync(resolve(dir, 'astro-poc', 'src', 'data'), { recursive: true });
  writeFileSync(
    resolve(dir, 'data', 'product_data.json'),
    JSON.stringify({ version: 'test', last_updated: '', rev: 0, products: [] })
  );
  writeFileSync(
    resolve(dir, 'data', 'category_registry.json'),
    JSON.stringify({ nav_groups: [], categories: [] })
  );
  writeFileSync(
    resolve(dir, 'astro-poc', 'src', 'data', 'storefront-experience.json'),
    JSON.stringify({
      trustBar: { highlights: [], statusItems: [] },
      home: {
        primaryCategories: [],
        secondaryCategories: [],
        fallbackQuickPicks: [],
        featuredStaples: [],
      },
      bundles: [],
      companionRules: [],
    })
  );
}

test('GET /api/v1/diagnostics returns a structured, actionable report', async () => {
  const dir = createTempDir();
  setup(dir);
  try {
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/api/v1/diagnostics' });
    expect(res.statusCode).toBe(200);
    const body = res.json<{
      checks: Array<{ name: string; status: string; message: string; remediation?: string }>;
      summary: { ok: number; warn: number; error: number };
      recoveryNeeded: boolean;
    }>();
    expect(body.checks.length).toBeGreaterThan(5);
    expect(body.checks.every((c) => ['ok', 'warn', 'error'].includes(c.status))).toBe(true);
    expect(body.checks.some((c) => c.name === 'recovery-journal')).toBe(true);
    expect(body.summary.ok + body.summary.warn + body.summary.error).toBe(body.checks.length);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('diagnostics redact absolute paths and token-like values', async () => {
  const dir = createTempDir();
  setup(dir);
  try {
    // A stale .tmp file makes the report carry a data/ path; a recovery
    // journal failure would too — seed a token-like value in the tree.
    writeFileSync(resolve(dir, 'data', 'stale.tmp'), 'x');

    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/api/v1/diagnostics' });
    const body = res.json<{ repoRoot: string; checks: Array<{ message: string }> }>();

    // Absolute path collapsed to basename; no /tmp/ home path leaks.
    expect(body.repoRoot).not.toContain('/');
    expect(JSON.stringify(body)).not.toContain(tmpdir());
    // The .tmp warning is present and its message has no absolute paths.
    expect(body.checks.some((c) => c.message.includes('.tmp'))).toBe(true);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('redactDoctorReport scrubs credential-in-URL and long tokens', async () => {
  const { redactDoctorReport } = await import('../../src/server/services/doctor.ts');
  const report = {
    timestamp: 't',
    nodeVersion: 'v24.0.0',
    repoRoot: '/home/carlos/projects/elrincondeebano',
    checks: [
      {
        name: 'sync',
        status: 'error' as const,
        message:
          'failed for https://user:sup3rsecret@example.com/api and token abcDEF0123456789abcdef0123456789',
      },
    ],
    summary: { ok: 0, warn: 0, error: 1 },
    recoveryNeeded: false,
  };

  const redacted = redactDoctorReport(report);
  expect(redacted.repoRoot).toBe('elrincondeebano');
  expect(redacted.checks[0].message).not.toContain('sup3rsecret');
  expect(redacted.checks[0].message).not.toContain('abcDEF0123456789abcdef0123456789');
  expect(redacted.checks[0].message).toContain('[REDACTED]');
});
