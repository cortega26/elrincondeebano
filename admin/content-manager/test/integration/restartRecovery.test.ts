import { test, expect } from 'vitest';
import { PersistentIdempotencyStore } from '../../src/server/services/persistentIdempotencyStore.ts';
import { mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';

function createTempDir(): string {
  const dir = resolve(
    tmpdir(),
    `cm-idempotent-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

test('PersistentIdempotencyStore persists and loads across restarts', async () => {
  const dir = createTempDir();

  try {
    // Create a store and set a command result
    const store1 = new PersistentIdempotencyStore(dir, 200);
    const commandId = 'cmd-restart-recovery-001';
    const result = {
      command_id: commandId,
      status: 'ok' as const,
      resulting_revision: 5,
      changed_fields: ['price'],
    };

    store1.set(commandId, result);
    expect(store1.has(commandId)).toBe(true);
    expect(store1.get(commandId)?.status).toBe('ok');

    // Simulate restart: create new store from same dir
    const store2 = new PersistentIdempotencyStore(dir, 200);
    expect(store2.has(commandId)).toBe(true);

    const loaded = store2.get(commandId);
    expect(loaded).toBeDefined();
    expect(loaded!.command_id).toBe(commandId);
    expect(loaded!.status).toBe('ok');
    expect(loaded!.resulting_revision).toBe(5);
    expect(loaded!.changed_fields).toEqual(['price']);

    store1.clear();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('PersistentIdempotencyStore has() returns true across restarts', async () => {
  const dir = createTempDir();

  try {
    const store1 = new PersistentIdempotencyStore(dir, 200);
    const commandId = 'cmd-has-check-002';

    store1.set(commandId, {
      command_id: commandId,
      status: 'ok',
      resulting_revision: 1,
    });

    expect(store1.has(commandId)).toBe(true);

    // New store instance
    const store2 = new PersistentIdempotencyStore(dir, 200);
    expect(store2.has(commandId)).toBe(true);
    expect(store2.has('non-existent')).toBe(false);

    store1.clear();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('PersistentIdempotencyStore deletes and recreates correctly loads from disk', async () => {
  const dir = createTempDir();

  try {
    // First store: set a value
    const store1 = new PersistentIdempotencyStore(dir, 200);
    const commandId = 'cmd-recreate-003';

    store1.set(commandId, {
      command_id: commandId,
      status: 'ok',
      resulting_revision: 3,
    });

    expect(store1.has(commandId)).toBe(true);

    // Clear (deletes file)
    store1.clear();
    expect(store1.has(commandId)).toBe(false);
    expect(store1.size).toBe(0);

    // Recreate from same dir — should be empty
    const store2 = new PersistentIdempotencyStore(dir, 200);
    expect(store2.has(commandId)).toBe(false);
    expect(store2.size).toBe(0);

    // Set a new value in recreated store
    const newCmdId = 'cmd-recreate-003b';
    store2.set(newCmdId, {
      command_id: newCmdId,
      status: 'conflict' as const,
    });

    // New instance should see the new value
    const store3 = new PersistentIdempotencyStore(dir, 200);
    expect(store3.has(commandId)).toBe(false);
    expect(store3.has(newCmdId)).toBe(true);
    expect(store3.get(newCmdId)?.status).toBe('conflict');

    store2.clear();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
