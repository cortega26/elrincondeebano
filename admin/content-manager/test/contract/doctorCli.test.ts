// Plan 206 slice 5: machine exit contract for the doctor CLI.
// Spawns the real script against temp repos: healthy -> 0, errors -> 1,
// warnings-only -> 0 by default but 1 with --fail-on warn.
import { test, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';

const DOCTOR_SCRIPT = resolve(__dirname, '../../scripts/doctor.ts');

function createTempRepo(kind: 'healthy' | 'warn-only' | 'broken'): string {
  const dir = resolve(tmpdir(), `doctor-cli-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(resolve(dir, 'data'), { recursive: true });
  if (kind !== 'broken') {
    writeFileSync(
      resolve(dir, 'data', 'product_data.json'),
      JSON.stringify({ products: [], rev: 0 })
    );
  }
  if (kind === 'healthy') {
    writeFileSync(
      resolve(dir, 'data', 'category_registry.json'),
      JSON.stringify({ categories: [], nav_groups: [] })
    );
    mkdirSync(resolve(dir, 'astro-poc', 'src', 'data'), { recursive: true });
    writeFileSync(
      resolve(dir, 'astro-poc', 'src', 'data', 'storefront-experience.json'),
      JSON.stringify({ home: {} })
    );
    mkdirSync(resolve(dir, 'assets', 'images'), { recursive: true });
  }
  return dir;
}

function runDoctorCli(dir: string, extraArgs: string[] = []): number {
  try {
    execFileSync(process.execPath, ['--import', 'tsx', DOCTOR_SCRIPT, ...extraArgs], {
      cwd: resolve(__dirname, '../..'),
      env: { ...process.env, REPO_ROOT: dir },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return 0;
  } catch (err) {
    return (err as { status?: number }).status ?? -1;
  }
}

test('doctor CLI exits 0 on a healthy repo', () => {
  const dir = createTempRepo('healthy');
  try {
    expect(runDoctorCli(dir)).toBe(0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('doctor CLI exits 1 on a broken repo (default fail-on error)', () => {
  const dir = createTempRepo('broken');
  try {
    expect(runDoctorCli(dir)).toBe(1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('doctor CLI warn-only repo exits 0 by default, 1 with --fail-on warn', () => {
  const dir = createTempRepo('warn-only');
  try {
    expect(runDoctorCli(dir)).toBe(0);
    expect(runDoctorCli(dir, ['--fail-on', 'warn'])).toBe(1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
