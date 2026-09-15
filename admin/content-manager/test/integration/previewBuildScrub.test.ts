// Plan 184: job-result path scrubbing — build output embeds absolute
// operator paths; GET /jobs/:id is an unauthenticated loopback read, so the
// persisted output/error strings are scrubbed with the doctor convention.
import { test, expect } from 'vitest';
import { scrubSensitiveText } from '../../src/server/services/doctor.ts';
import { runPreviewBuild } from '../../src/server/services/previewBuild.ts';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';

test('scrubSensitiveText redacts roots, tokens, and credentialed URLs', () => {
  const root = '/home/operator/work/repo';
  expect(scrubSensitiveText(`reading ${root}/data/x.json failed`, root)).toBe(
    'reading repo/data/x.json failed'
  );
  expect(scrubSensitiveText('token abcdefghijklmnopqrstuvwxyz123456', root)).toBe(
    'token [REDACTED]'
  );
  expect(scrubSensitiveText('push https://user:s3cret@example.com/r.git', root)).toBe(
    'push https://[REDACTED]@example.com/r.git'
  );
  expect(scrubSensitiveText('plain message with no secrets', root)).toBe(
    'plain message with no secrets'
  );
});

test('failed preview builds persist no absolute operator paths', async () => {
  const dir = resolve(
    tmpdir(),
    `cm-preview-scrub-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );
  mkdirSync(dir, { recursive: true });
  try {
    writeFileSync(
      resolve(dir, 'package.json'),
      JSON.stringify({
        name: 'preview-scrub-fixture',
        version: '1.0.0',
        scripts: { 'build:fast': 'node build-fail.mjs' },
      })
    );
    writeFileSync(
      resolve(dir, 'build-fail.mjs'),
      "console.error('marker:' + process.cwd() + '/secret-marker-dir');\nprocess.exit(1);\n"
    );

    const result = await runPreviewBuild(dir, { timeoutMs: 30000 });
    expect(result.success).toBe(false);
    // Sensitivity control: the fixture really does emit the absolute path,
    // so the assertion below proves the pipeline scrubbed it (not that the
    // fixture never printed it).
    let rawStderr = '';
    try {
      execFileSync('node', [resolve(dir, 'build-fail.mjs')], { cwd: dir, encoding: 'utf-8' });
    } catch (err) {
      rawStderr = (err as { stderr?: unknown }).stderr as string;
    }
    expect(rawStderr).toContain(dir);
    expect(result.error ?? '').not.toContain(dir);
    // The basename survives so the message stays debuggable.
    expect(result.error ?? '').toContain('secret-marker-dir');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 60000);
