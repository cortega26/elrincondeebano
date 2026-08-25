import { test, expect } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { StorefrontRepository } from '../../src/server/repositories/storefrontRepository.ts';

function createTempDir(): string {
  const dir = resolve(tmpdir(), `cm-sf-cache-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
  mkdirSync(resolve(dir, 'astro-poc', 'src', 'data'), { recursive: true });
  return dir;
}

function seedExperience(dir: string, bundles: unknown[] = []): void {
  writeFileSync(
    resolve(dir, 'astro-poc', 'src', 'data', 'storefront-experience.json'),
    JSON.stringify({
      trustBar: { highlights: [{ label: 'Envío', value: 'Gratis' }], statusItems: [] },
      home: {
        primaryCategories: [],
        secondaryCategories: [],
        fallbackQuickPicks: [],
        featuredStaples: [],
      },
      bundles,
      companionRules: [],
    })
  );
}

// Plan 150: StorefrontRepository mtime+size cache — hit returns same
// reference (no structuredClone, unlike ProductRepository); writes and
// external edits invalidate.

test('load() twice with no write between is served from cache (same reference)', () => {
  const dir = createTempDir();
  try {
    seedExperience(dir, []);
    const repo = new StorefrontRepository({ repoRoot: dir });
    const first = repo.load();
    const second = repo.load();
    expect(second).toBe(first);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('getBundles() benefits from load() cache', () => {
  const dir = createTempDir();
  try {
    seedExperience(dir, [
      { id: 'b1', title: 'T1', description: 'D', items: [{ category: 'c', name: 'n' }] },
    ]);
    const repo = new StorefrontRepository({ repoRoot: dir });
    const first = repo.load();
    const bundles = repo.getBundles();
    // getBundles delegates to load — should hit cache and return same bundle array reference
    expect(bundles).toBe(first.bundles);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('cache invalidated after write: next load returns fresh data and new identity', () => {
  const dir = createTempDir();
  try {
    seedExperience(dir, []);
    const repo = new StorefrontRepository({ repoRoot: dir });
    const first = repo.load();
    expect(first.bundles).toHaveLength(0);

    const updated = {
      ...first,
      bundles: [{ id: 'b1', title: 'Nuevo', description: 'Desc', items: [{ category: 'c', name: 'n' }] }],
    };
    const result = repo.write(updated as unknown as ReturnType<typeof repo.load>);
    expect(result.ok).toBe(true);

    const afterWrite = repo.load();
    expect(afterWrite).not.toBe(first);
    expect(afterWrite.bundles).toHaveLength(1);
    expect(afterWrite.bundles[0].id).toBe('b1');

    // Subsequent load without write is cached again
    const cachedAgain = repo.load();
    expect(cachedAgain).toBe(afterWrite);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('external file edit invalidates cache via mtime/size', async () => {
  const dir = createTempDir();
  try {
    seedExperience(dir, []);
    const repo = new StorefrontRepository({ repoRoot: dir });
    const first = repo.load();
    expect(first.bundles).toHaveLength(0);

    // External edit — direct overwrite (simulates git pull). Sleep a tick so mtime advances
    // on filesystems with coarse granularity; ensure size also changes.
    await new Promise((r) => setTimeout(r, 15));
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
        bundles: [{ id: 'ext', title: 'Ext', description: 'D', items: [{ category: 'c', name: 'n' }] }],
        companionRules: [],
      })
    );

    const afterExternal = repo.load();
    expect(afterExternal).not.toBe(first);
    expect(afterExternal.bundles).toHaveLength(1);
    expect(afterExternal.bundles[0].id).toBe('ext');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('load bytes are identical on consecutive cached reads', () => {
  const dir = createTempDir();
  try {
    seedExperience(dir, []);
    const repo = new StorefrontRepository({ repoRoot: dir });
    const a = repo.load();
    const b = repo.load();
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    // Also raw file content unchanged between cached reads
    const raw = readFileSync(resolve(dir, 'astro-poc', 'src', 'data', 'storefront-experience.json'), 'utf-8');
    expect(JSON.stringify(JSON.parse(raw))).toBe(JSON.stringify(a));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
