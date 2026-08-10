import { test, expect } from 'vitest';
import { isSafeId } from '../../src/shared/identity.ts';

test('isSafeId accepts generated ids', () => {
  expect(isSafeId('cs-1786395000000-abc123')).toBe(true);
  expect(isSafeId('20260810-142139')).toBe(true);
  expect(isSafeId('pre-restore-20260810-142139-1a2b3c')).toBe(true);
  expect(isSafeId('conflict-42')).toBe(true);
  expect(isSafeId('a.b-c_d')).toBe(true);
});

test('isSafeId rejects path separators', () => {
  expect(isSafeId('../../data/x')).toBe(false);
  expect(isSafeId('..%2F..%2Fdata%2Fx')).toBe(false);
  expect(isSafeId('data/x.json')).toBe(false);
  expect(isSafeId('a\\b')).toBe(false);
  expect(isSafeId('..')).toBe(false);
});

test('isSafeId rejects non-allowlisted characters', () => {
  expect(isSafeId('x%2e%2e')).toBe(false);
  expect(isSafeId('a b')).toBe(false);
  expect(isSafeId('a:b')).toBe(false);
  expect(isSafeId('a?b')).toBe(false);
  expect(isSafeId('a#b')).toBe(false);
});

test('isSafeId rejects empty and oversized ids', () => {
  expect(isSafeId('')).toBe(false);
  expect(isSafeId('x'.repeat(129))).toBe(false);
  expect(isSafeId('x'.repeat(128))).toBe(true);
});

test('isSafeId rejects non-string values', () => {
  expect(isSafeId(undefined as unknown as string)).toBe(false);
  expect(isSafeId(null as unknown as string)).toBe(false);
  expect(isSafeId(42 as unknown as string)).toBe(false);
});
