// Plan 195: the shared undo-stack module — single implementation of the
// plan-099 move semantics, re-exported by both product and category undo.
import { test, expect } from 'vitest';
import { moveEntryOnSuccess, type StackRef } from '../../src/web/app/undoStack.ts';
import { moveEntryOnSuccess as productMove } from '../../src/web/app/routes/undo.ts';
import { moveEntryOnSuccess as categoryMove } from '../../src/web/app/routes/categoryUndo.ts';

test('both undo modules re-export the identical move implementation', () => {
  expect(productMove).toBe(moveEntryOnSuccess);
  expect(categoryMove).toBe(moveEntryOnSuccess);
});

test('successful operation moves the entry to the target stack', async () => {
  const source: StackRef<string> = { current: ['a'] };
  const target: StackRef<string> = { current: [] };
  await moveEntryOnSuccess(source, target, async () => {});
  expect(source.current).toEqual([]);
  expect(target.current).toEqual(['a']);
});

test('failed operation restores the entry to the source stack and rethrows', async () => {
  const source: StackRef<string> = { current: ['a'] };
  const target: StackRef<string> = { current: [] };
  const failure = new Error('nope');
  await expect(
    moveEntryOnSuccess(source, target, async () => {
      throw failure;
    })
  ).rejects.toBe(failure);
  expect(source.current).toEqual(['a']);
  expect(target.current).toEqual([]);
});

test('empty source is a no-op', async () => {
  const source: StackRef<string> = { current: [] };
  const target: StackRef<string> = { current: [] };
  let called = false;
  await moveEntryOnSuccess(source, target, async () => {
    called = true;
  });
  expect(called).toBe(false);
});
