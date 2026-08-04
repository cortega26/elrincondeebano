import { test, expect } from 'vitest';
import { generateUuidV7, generateProductId, isUuidV7 } from '../../src/shared/identity.ts';

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
