import { test, expect } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { ensureCategoryOgAssets } from '../../src/server/services/categoryOgLifecycle.ts';
import { MediaIntentRepository } from '../../src/server/repositories/mediaIntentRepository.ts';
import type { MediaJobInput, MediaJobResult } from '../../src/server/services/mediaJobs.ts';

// Plan 106: the category OG lifecycle — durable intent + "verify canonical
// state, then mark applied" contract — with a stubbed runner (no python3).

const setup = () => {
  const dir = resolve(
    tmpdir(),
    `og-lifecycle-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );
  mkdirSync(resolve(dir, 'data'), { recursive: true });
  mkdirSync(resolve(dir, 'assets', 'images', 'og', 'categories'), { recursive: true });
  return dir;
};

const okRunner = (): Promise<MediaJobResult> =>
  Promise.resolve({
    ok: true,
    output_kind: 'canonical',
    outputs: ['/assets/images/og/categories/test.png'],
  });

const failRunner = (error: string): Promise<MediaJobResult> =>
  Promise.resolve({ ok: false, outputs: [], error });

const throwRunner = (): Promise<MediaJobResult> =>
  Promise.reject(new Error('intents store exploded'));

const latestIntent = (dir: string) => {
  const intents = new MediaIntentRepository(dir);
  const all = intents.listAll();
  expect(all.length).toBeGreaterThan(0);
  return all[all.length - 1];
};

test('generate ok + canonical file present → intent applied', async () => {
  const dir = setup();
  try {
    writeFileSync(resolve(dir, 'assets', 'images', 'og', 'categories', 'test.png'), 'OG');
    const result = await ensureCategoryOgAssets(dir, 'test', 'generate', okRunner);
    expect(result.ok).toBe(true);
    const intent = latestIntent(dir);
    expect(intent.status).toBe('applied');
    expect(intent.progress).toBe(100);
    expect(intent.target_path).toBe('assets/images/og/categories/test.png');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('generate ok but canonical file missing → intent failed', async () => {
  const dir = setup();
  try {
    const result = await ensureCategoryOgAssets(dir, 'test', 'generate', okRunner);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('OG image was not generated');
    const intent = latestIntent(dir);
    expect(intent.status).toBe('failed');
    expect(intent.errors).toContain('OG image was not generated');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('delete ok but file still present → intent failed', async () => {
  const dir = setup();
  try {
    writeFileSync(resolve(dir, 'assets', 'images', 'og', 'categories', 'test.png'), 'OG');
    const result = await ensureCategoryOgAssets(dir, 'test', 'delete', okRunner);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('OG image is still present');
    const intent = latestIntent(dir);
    expect(intent.status).toBe('failed');
    expect(intent.errors).toContain('OG image is still present');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('job failure → intent failed with the error recorded', async () => {
  const dir = setup();
  try {
    const result = await ensureCategoryOgAssets(dir, 'test', 'generate', () => failRunner('boom'));
    expect(result.ok).toBe(false);
    expect(result.error).toBe('boom');
    const intent = latestIntent(dir);
    expect(intent.status).toBe('failed');
    expect(intent.errors).toContain('boom');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('runner throws → intent failed, never stuck running, ok:false', async () => {
  const dir = setup();
  try {
    const result = await ensureCategoryOgAssets(dir, 'test', 'generate', throwRunner);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('intents store exploded');
    const intent = latestIntent(dir);
    expect(intent.status).toBe('failed');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the intent is durable on disk (survives a fresh repository)', async () => {
  const dir = setup();
  try {
    writeFileSync(resolve(dir, 'assets', 'images', 'og', 'categories', 'test.png'), 'OG');
    await ensureCategoryOgAssets(dir, 'test', 'generate', okRunner);
    const fresh = new MediaIntentRepository(dir).listAll();
    expect(fresh.some((i) => i.status === 'applied')).toBe(true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// Type-only guard: the seam signature matches the real runner.
void (null as unknown as MediaJobInput);
