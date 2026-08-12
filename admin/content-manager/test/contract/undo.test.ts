import { test, expect } from 'vitest';
import { buildUndoEntry, computeUndoActions } from '../../src/web/app/routes/undo.ts';
import type { UndoSnapshotProduct } from '../../src/web/app/routes/undo.ts';

const PRODUCTS: UndoSnapshotProduct[] = [
  { id: 'p1', price: 1000, discount: 100, stock: true, category: 'snacks' },
  { id: 'p2', price: 2000, discount: 0, stock: false, category: 'drinks' },
];

test('undo entry built without preview has old values from current products', () => {
  const entry = buildUndoEntry({
    action: 'set_stock',
    value: true,
    productIds: ['p1', 'p2'],
    products: PRODUCTS,
    preview: null,
  });

  expect(entry.perProductOldValues).toEqual([
    { product_id: 'p1', field: 'stock', old_value: true },
    { product_id: 'p2', field: 'stock', old_value: false },
  ]);
});

test('discount undo restores the original discount (not 0)', () => {
  const entry = buildUndoEntry({
    action: 'set_discount_fixed',
    value: 500,
    productIds: ['p1'],
    products: PRODUCTS,
    preview: null,
  });
  const actions = computeUndoActions(entry, [{ id: 'p1', rev: 3 }]);

  expect(actions).toEqual([{ id: 'p1', rev: 3, patch: { discount: 100 } }]);
});

test('price-delta undo restores the original price', () => {
  const entry = buildUndoEntry({
    action: 'set_price_delta_percent',
    value: 10,
    productIds: ['p2'],
    products: PRODUCTS,
    preview: null,
  });
  const actions = computeUndoActions(entry, [{ id: 'p2', rev: 1 }]);

  expect(actions).toEqual([{ id: 'p2', rev: 1, patch: { price: 2000 } }]);
});

test('category undo restores the original category (not "0")', () => {
  const preview = [{ product_id: 'p1', field: 'category', old_value: 'snacks' }];
  const entry = buildUndoEntry({
    action: 'set_category',
    value: 'drinks',
    productIds: ['p1'],
    products: PRODUCTS,
    preview,
  });
  const actions = computeUndoActions(entry, [{ id: 'p1', rev: 5 }]);

  expect(actions).toEqual([{ id: 'p1', rev: 5, patch: { category: 'snacks' } }]);
});

test('stock undo inverts the stored value', () => {
  // p1 starts in stock (true); the bulk apply below turns it off (false), so
  // undo must restore the pre-apply true — not simply reapply false again.
  const entry = buildUndoEntry({
    action: 'set_stock',
    value: false,
    productIds: ['p1'],
    products: PRODUCTS,
    preview: null,
  });
  const actions = computeUndoActions(entry, [{ id: 'p1', rev: 2 }]);

  expect(actions).toEqual([{ id: 'p1', rev: 2, patch: { stock: true } }]);
});

test('preview values are preferred over the current-product fallback', () => {
  const preview = [{ product_id: 'p1', field: 'discount', old_value: 250 }];
  const entry = buildUndoEntry({
    action: 'set_discount_percent',
    value: 5,
    productIds: ['p1'],
    products: PRODUCTS,
    preview,
  });

  expect(entry.perProductOldValues).toEqual([
    { product_id: 'p1', field: 'discount', old_value: 250 },
  ]);
});

// ── plan 099: stack semantics — entries move ONLY on success ────────────────

import { moveEntryOnSuccess } from '../../src/web/app/routes/undo.ts';

const makeEntry = (id: string) => ({
  id,
  perProductOldValues: [{ product_id: 'p', field: 'stock' as const, old_value: true }],
});

test('moveEntryOnSuccess pushes to the target stack after a successful operation', async () => {
  const source = { current: [makeEntry('e1')] };
  const target = { current: [] as Array<{ id: string }> };

  await moveEntryOnSuccess(source, target, async () => {});

  expect(source.current).toHaveLength(0);
  expect(target.current.map((e) => e.id)).toEqual(['e1']);
});

test('moveEntryOnSuccess restores the entry to the source stack on failure', async () => {
  const source = { current: [makeEntry('e1')] };
  const target = { current: [] as Array<{ id: string }> };

  await expect(
    moveEntryOnSuccess(source, target, async () => {
      throw new Error('409 stale revision');
    })
  ).rejects.toThrow('409 stale revision');

  expect(source.current.map((e) => e.id)).toEqual(['e1']);
  expect(target.current).toHaveLength(0);
});

test('moveEntryOnSuccess keeps the failure entry retryable (idempotent retry)', async () => {
  const source = { current: [makeEntry('e1')] };
  const target = { current: [] as Array<{ id: string }> };
  let calls = 0;

  const op = async () => {
    calls += 1;
    if (calls === 1) throw new Error('network');
  };

  await expect(moveEntryOnSuccess(source, target, op)).rejects.toThrow('network');
  await moveEntryOnSuccess(source, target, op);

  expect(calls).toBe(2);
  expect(source.current).toHaveLength(0);
  expect(target.current.map((e) => e.id)).toEqual(['e1']);
});

test('moveEntryOnSuccess is a no-op on an empty source stack', async () => {
  const source = { current: [] as Array<{ id: string }> };
  const target = { current: [] as Array<{ id: string }> };
  let ran = false;

  await moveEntryOnSuccess(source, target, async () => {
    ran = true;
  });

  expect(ran).toBe(false);
  expect(target.current).toHaveLength(0);
});
