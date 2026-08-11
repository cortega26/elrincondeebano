import { test, expect } from 'vitest';
import {
  generateUuidV7,
  generateProductId,
  isUuidV7,
  isContainedWithin,
} from '../../src/shared/identity.ts';

test('generateUuidV7 produces a valid UUIDv7', () => {
  const uuid = generateUuidV7();
  expect(isUuidV7(uuid)).toBe(true);

  const parts = uuid.split('-');
  expect(parts).toHaveLength(5);
  expect(parts[0]).toHaveLength(8);
  expect(parts[2]).toMatch(/^7/); // version 7
  expect(parts[3]).toMatch(/^[89ab]/); // variant
});

test('generateUuidV7 produces unique values', () => {
  const ids = new Set<string>();
  for (let i = 0; i < 100; i++) {
    ids.add(generateUuidV7());
  }
  expect(ids.size).toBe(100);
});

test('generateProductId returns a UUIDv7', () => {
  const id = generateProductId();
  expect(isUuidV7(id)).toBe(true);
});

test('isUuidV7 rejects invalid values', () => {
  expect(isUuidV7('not-a-uuid')).toBe(false);
  expect(isUuidV7('')).toBe(false);
  expect(isUuidV7('00000000-0000-0000-0000-000000000000')).toBe(false); // v0, not v7
});

// ── plan 090: path containment ───────────────────────────────────────────────

test('isContainedWithin accepts descendants and rejects escapes', () => {
  const root = '/repo/data/.media-staging';
  expect(isContainedWithin(root, '/repo/data/.media-staging/file.webp')).toBe(true);
  expect(isContainedWithin(root, '/repo/data/.media-staging')).toBe(true);
  // Prefix collision: a sibling directory must NOT pass.
  expect(isContainedWithin(root, '/repo/data/.media-staging2/file.webp')).toBe(false);
  // Traversal and absolute escapes.
  expect(isContainedWithin(root, '/repo/data/.media-staging/../../etc/passwd')).toBe(false);
  expect(isContainedWithin(root, '/etc/passwd')).toBe(false);
  expect(isContainedWithin(root, '/repo/other/file')).toBe(false);
});
