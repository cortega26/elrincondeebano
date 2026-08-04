import { test, expect } from 'vitest';
import {
  isValidTransition,
  ALLOWED_TRANSITIONS,
  generateChangeSetId,
} from '../../src/shared/schemas/changeSet.ts';

test('draft can go to validating', () =>
  expect(isValidTransition('draft', 'validating')).toBe(true));
test('draft can go to discarded', () => expect(isValidTransition('draft', 'discarded')).toBe(true));
test('draft cannot go to published', () =>
  expect(isValidTransition('draft', 'published')).toBe(false));
test('published is terminal', () => expect(ALLOWED_TRANSITIONS.published).toHaveLength(0));
test('discarded is terminal', () => expect(ALLOWED_TRANSITIONS.discarded).toHaveLength(0));
test('failed can retry', () => expect(isValidTransition('failed', 'validating')).toBe(true));
test('failed can be discarded', () => expect(isValidTransition('failed', 'discarded')).toBe(true));
test('publishing to published', () =>
  expect(isValidTransition('publishing', 'published')).toBe(true));
test('publishing to failed', () => expect(isValidTransition('publishing', 'failed')).toBe(true));
test('generateChangeSetId unique', () => {
  const ids = new Set(Array.from({ length: 50 }, () => generateChangeSetId()));
  expect(ids.size).toBe(50);
});
