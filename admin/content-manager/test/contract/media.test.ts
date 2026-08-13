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
