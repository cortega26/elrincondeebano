import { test, expect } from 'vitest';
import {
  isValidTransition,
  ALLOWED_TRANSITIONS,
  generateChangeSetId,
} from '../../src/shared/schemas/changeSet.ts';
import {
  forbiddenOpFields,
  EDITABLE_PRODUCT_FIELDS,
  CREATE_EXTRA_FIELDS,
} from '../../src/server/services/changeSetApplier.ts';

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

// ── plan 087: field allowlist ────────────────────────────────────────────────

test('editable fields are exactly the product write surface', () => {
  expect(EDITABLE_PRODUCT_FIELDS.sort()).toEqual(
    [
      'name',
      'description',
      'price',
      'discount',
      'stock',
      'category',
      'image_path',
      'image_avif_path',
      'is_archived',
    ].sort()
  );
});

test('forbiddenOpFields flags server-owned and unknown keys', () => {
  expect(
    forbiddenOpFields({ price: 600, rev: 0, order: 5, id: 'x', slug: 'y', field_last_modified: {} })
  ).toEqual(expect.arrayContaining(['rev', 'order', 'id', 'slug', 'field_last_modified']));
  expect(forbiddenOpFields({ price: 600, stock: false })).toEqual([]);
  expect(forbiddenOpFields({ id: 'explicit-1' }, CREATE_EXTRA_FIELDS)).toEqual([]);
  expect(forbiddenOpFields({ id: 'x' })).toEqual(['id']);
});
