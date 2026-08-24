import { test, expect } from 'vitest';
import {
  isSafeMediaPath,
  isValidMediaExtension,
  getMediaExtension,
} from '../../src/shared/schemas/media.ts';
import { MediaRepository } from '../../src/server/repositories/mediaRepository.ts';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';

test('isSafeMediaPath accepts valid paths', () => {
  expect(isSafeMediaPath('assets/images/product.webp')).toBe(true);
  expect(isSafeMediaPath('assets/images/cat/sub/image.png')).toBe(true);
  expect(isSafeMediaPath('assets/images/product.avif')).toBe(true);
});

test('isSafeMediaPath rejects traversal paths', () => {
  expect(isSafeMediaPath('../assets/images/x.png')).toBe(false);
  expect(isSafeMediaPath('assets/../../images/x.png')).toBe(false);
  expect(isSafeMediaPath('/etc/passwd')).toBe(false);
});

test('isSafeMediaPath rejects non-media dirs', () => {
  expect(isSafeMediaPath('assets/other/x.png')).toBe(false);
  expect(isSafeMediaPath('data/x.png')).toBe(false);
});

test('isValidMediaExtension accepts valid extensions', () => {
  expect(isValidMediaExtension('x.png')).toBe(true);
  expect(isValidMediaExtension('x.webp')).toBe(true);
  expect(isValidMediaExtension('x.avif')).toBe(true);
  expect(isValidMediaExtension('x.jpg')).toBe(true);
});

test('isValidMediaExtension rejects invalid extensions', () => {
  expect(isValidMediaExtension('x.exe')).toBe(false);
  expect(isValidMediaExtension('x.txt')).toBe(false);
  expect(isValidMediaExtension('x')).toBe(false);
});

test('getMediaExtension returns correct extension', () => {
  expect(getMediaExtension('file.png')).toBe('.png');
  expect(getMediaExtension('path/to/file.WEBP')).toBe('.webp');
  expect(getMediaExtension('noext')).toBe('');
});

test('MediaRepository.validatePath rejects traversal', () => {
  const dir = resolve(tmpdir(), `cm-media-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  try {
    const repo = new MediaRepository({ repoRoot: dir });
    expect(repo.validatePath('../etc/passwd').ok).toBe(false);
    expect(repo.validatePath('assets/images/../../../etc/passwd').ok).toBe(false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('MediaRepository.validatePath accepts valid paths', () => {
  const dir = resolve(tmpdir(), `cm-media-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  try {
    const repo = new MediaRepository({ repoRoot: dir });
    expect(repo.validatePath('assets/images/test.webp').ok).toBe(true);
    expect(repo.validatePath('assets/images/sub/dir/image.png').ok).toBe(true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('MediaRepository.getInventory scans files', () => {
  const dir = resolve(tmpdir(), `cm-media-${Date.now()}`);
  const assetsDir = resolve(dir, 'assets', 'images');
  mkdirSync(assetsDir, { recursive: true });

  try {
    writeFileSync(resolve(assetsDir, 'used.webp'), 'fake');
    writeFileSync(resolve(assetsDir, 'orphan.png'), 'fake');

    const repo = new MediaRepository({ repoRoot: dir });
    const { items } = repo.getInventory([
      {
        name: 'P1',
        description: '',
        price: 100,
        discount: 0,
        stock: true,
        category: '',
        image_path: 'assets/images/used.webp',
        image_avif_path: '',
        order: 0,
        is_archived: false,
        rev: 1,
        field_last_modified: {},
      },
    ]);

    expect(items.length).toBeGreaterThanOrEqual(2);
    const used = items.find((i) => i.path === 'used.webp');
    expect(used).toBeDefined();
    expect(used!.status).toBe('active');
    expect(used!.productName).toBe('P1');

    const orphan = items.find((i) => i.path === 'orphan.png');
    expect(orphan).toBeDefined();
    expect(orphan!.status).toBe('orphan');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('MediaRepository.getInventory detects missing files', () => {
  const dir = resolve(tmpdir(), `cm-media-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  mkdirSync(resolve(dir, 'assets', 'images'), { recursive: true });

  try {
    const repo = new MediaRepository({ repoRoot: dir });
    const { items } = repo.getInventory([
      {
        name: 'P1',
        description: '',
        price: 100,
        discount: 0,
        stock: true,
        category: '',
        image_path: 'assets/images/missing.webp',
        image_avif_path: '',
        order: 0,
        is_archived: false,
        rev: 1,
        field_last_modified: {},
      },
    ]);

    const missing = items.find((i) => i.status === 'missing');
    expect(missing).toBeDefined();
    expect(missing!.path).toBe('missing.webp');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('MediaRepository.getInventory caches on unchanged stamp (same array identity)', () => {
  const dir = resolve(tmpdir(), `cm-media-cache-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
  const assetsDir = resolve(dir, 'assets', 'images');
  mkdirSync(assetsDir, { recursive: true });
  try {
    writeFileSync(resolve(assetsDir, 'a.webp'), 'fake');
    const repo = new MediaRepository({ repoRoot: dir });
    const products = [
      {
        name: 'P1',
        description: '',
        price: 100,
        discount: 0,
        stock: true,
        category: '',
        image_path: 'assets/images/a.webp',
        image_avif_path: '',
        order: 0,
        is_archived: false,
        rev: 1,
        field_last_modified: {},
      },
    ];
    const first = repo.getInventory(products as never);
    const second = repo.getInventory(products as never);
    // Cache hit: same array/object identity
    expect(second.items).toBe(first.items);
    expect(second.summary).toBe(first.summary);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('MediaRepository.getInventory invalidates after new file (mtime change)', async () => {
  const dir = resolve(tmpdir(), `cm-media-inv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
  const assetsDir = resolve(dir, 'assets', 'images');
  mkdirSync(assetsDir, { recursive: true });
  try {
    writeFileSync(resolve(assetsDir, 'a.webp'), 'fake');
    const repo = new MediaRepository({ repoRoot: dir });
    const products: never[] = [];
    const first = repo.getInventory(products);
    expect(first.items.length).toBe(1);

    // Ensure filesystem mtime advances — directory mtime granularity can be ms
    await new Promise((r) => setTimeout(r, 30));
    writeFileSync(resolve(assetsDir, 'b.webp'), 'fake');
    // Also ensure new file's parent dir mtime is newer
    await new Promise((r) => setTimeout(r, 30));

    const second = repo.getInventory(products);
    expect(second.items).not.toBe(first.items);
    expect(second.items.length).toBe(2);
    expect(second.items.some((i) => i.path === 'b.webp')).toBe(true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('MediaRepository.getInventory invalidates after nested file (recursive stamp)', async () => {
  const dir = resolve(tmpdir(), `cm-media-nested-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
  const assetsDir = resolve(dir, 'assets', 'images');
  const subDir = resolve(assetsDir, 'sub');
  mkdirSync(subDir, { recursive: true });
  try {
    writeFileSync(resolve(assetsDir, 'a.webp'), 'fake');
    const repo = new MediaRepository({ repoRoot: dir });
    const first = repo.getInventory([]);
    expect(first.items.length).toBe(1);

    await new Promise((r) => setTimeout(r, 30));
    writeFileSync(resolve(subDir, 'nested.webp'), 'fake');
    await new Promise((r) => setTimeout(r, 30));

    const second = repo.getInventory([]);
    expect(second.items.length).toBe(2);
    expect(second.items.some((i) => i.path === 'sub/nested.webp')).toBe(true);
    expect(second.items).not.toBe(first.items);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('MediaRepository.getInventory summary single-pass counts are correct', () => {
  const dir = resolve(tmpdir(), `cm-media-sum-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
  const assetsDir = resolve(dir, 'assets', 'images');
  mkdirSync(assetsDir, { recursive: true });
  try {
    writeFileSync(resolve(assetsDir, 'active.webp'), 'fake');
    writeFileSync(resolve(assetsDir, 'orphan.png'), 'fake');

    const repo = new MediaRepository({ repoRoot: dir });
    const products = [
      {
        name: 'P1',
        description: '',
        price: 100,
        discount: 0,
        stock: true,
        category: '',
        image_path: 'assets/images/active.webp',
        image_avif_path: '',
        order: 0,
        is_archived: false,
        rev: 1,
        field_last_modified: {},
      },
      {
        name: 'P2',
        description: '',
        price: 100,
        discount: 0,
        stock: true,
        category: '',
        image_path: 'assets/images/missing.webp',
        image_avif_path: '',
        order: 0,
        is_archived: false,
        rev: 1,
        field_last_modified: {},
      },
    ];
    const { items, summary } = repo.getInventory(products as never);
    // active: 1 (active.webp), orphan: 1 (orphan.png), missing: 1 (missing.webp)
    expect(summary.total).toBe(items.length);
    expect(summary.total).toBe(3);
    expect(summary.active).toBe(1);
    expect(summary.orphans).toBe(1);
    expect(summary.missing).toBe(1);
    expect(summary.generated).toBe(0);
    expect(summary.staged).toBe(0);
    // Cross-check with manual filter to ensure single-pass matches
    expect(summary.active).toBe(items.filter((i) => i.status === 'active').length);
    expect(summary.orphans).toBe(items.filter((i) => i.status === 'orphan').length);
    expect(summary.missing).toBe(items.filter((i) => i.status === 'missing').length);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('MediaRepository.invalidate clears cache explicitly', () => {
  const dir = resolve(tmpdir(), `cm-media-inv2-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
  const assetsDir = resolve(dir, 'assets', 'images');
  mkdirSync(assetsDir, { recursive: true });
  try {
    writeFileSync(resolve(assetsDir, 'a.webp'), 'fake');
    const repo = new MediaRepository({ repoRoot: dir });
    const first = repo.getInventory([]);
    const second = repo.getInventory([]);
    expect(second.items).toBe(first.items);
    repo.invalidate();
    const third = repo.getInventory([]);
    expect(third.items).not.toBe(first.items);
    // Content is equal but identity differs after invalidate
    expect(third.items.length).toBe(first.items.length);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('MediaRepository cache keys on products input', () => {
  const dir = resolve(tmpdir(), `cm-media-prodkey-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
  const assetsDir = resolve(dir, 'assets', 'images');
  mkdirSync(assetsDir, { recursive: true });
  try {
    writeFileSync(resolve(assetsDir, 'a.webp'), 'fake');
    writeFileSync(resolve(assetsDir, 'b.webp'), 'fake');
    const repo = new MediaRepository({ repoRoot: dir });
    const prodA = [
      {
        name: 'P1',
        description: '',
        price: 100,
        discount: 0,
        stock: true,
        category: '',
        image_path: 'assets/images/a.webp',
        image_avif_path: '',
        order: 0,
        is_archived: false,
        rev: 1,
        field_last_modified: {},
      },
    ];
    const prodB = [
      {
        name: 'P1',
        description: '',
        price: 100,
        discount: 0,
        stock: true,
        category: '',
        image_path: 'assets/images/b.webp',
        image_avif_path: '',
        order: 0,
        is_archived: false,
        rev: 1,
        field_last_modified: {},
      },
    ];
    const first = repo.getInventory(prodA as never);
    const second = repo.getInventory(prodA as never);
    expect(second.items).toBe(first.items);
    const third = repo.getInventory(prodB as never);
    expect(third.items).not.toBe(first.items);
    // prodB should mark b.webp as active, a.webp as orphan
    expect(third.items.find((i) => i.path === 'b.webp')?.status).toBe('active');
    expect(third.items.find((i) => i.path === 'a.webp')?.status).toBe('orphan');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
