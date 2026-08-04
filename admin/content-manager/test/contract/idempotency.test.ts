import { test, expect } from 'vitest';
import { IdempotencyStore } from '../../src/server/services/idempotencyStore.ts';

test('IdempotencyStore stores and retrieves results', () => {
  const store = new IdempotencyStore();
  expect(store.has('cmd-1')).toBe(false);

  store.set('cmd-1', { command_id: 'cmd-1', status: 'ok', resulting_revision: 5 });
  expect(store.has('cmd-1')).toBe(true);

  const result = store.get('cmd-1');
  expect(result).toBeDefined();
  expect(result!.status).toBe('ok');
  expect(result!.resulting_revision).toBe(5);
});

test('IdempotencyStore returns undefined for unknown command', () => {
  const store = new IdempotencyStore();
  expect(store.get('nonexistent')).toBeUndefined();
});

test('IdempotencyStore evicts oldest when max reached', () => {
  const store = new IdempotencyStore(3);

  store.set('cmd-1', { command_id: 'cmd-1', status: 'ok' });
  store.set('cmd-2', { command_id: 'cmd-2', status: 'ok' });
  store.set('cmd-3', { command_id: 'cmd-3', status: 'ok' });
  expect(store.size).toBe(3);

  store.set('cmd-4', { command_id: 'cmd-4', status: 'ok' });
  expect(store.size).toBe(3);
  expect(store.has('cmd-1')).toBe(false); // evicted
  expect(store.has('cmd-4')).toBe(true);
});

test('IdempotencyStore clear removes all', () => {
  const store = new IdempotencyStore();
  store.set('a', { command_id: 'a', status: 'ok' });
  store.set('b', { command_id: 'b', status: 'ok' });
  store.clear();
  expect(store.size).toBe(0);
});
