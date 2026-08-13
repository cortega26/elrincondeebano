import { test, expect } from 'vitest';
import { ConflictService } from '../../src/domain/conflicts/conflictService.ts';
import type { Conflict } from '../../src/shared/schemas/conflict.ts';

function makeTestConflict(): Conflict {
  const service = new ConflictService();
  return service.createConflict({
    entity_type: 'product',
    entity_id: 'prod-1',
    entity_name: 'Test Product',
    base_revision: 5,
    local_snapshot: { name: 'Local Name', price: 100 },
    server_snapshot: { name: 'Server Name', price: 100 },
    fields: [
      {
        field: 'name',
        base_value: 'Base Name',
        local_value: 'Local Name',
        server_value: 'Server Name',
      },
      {
        field: 'description',
        base_value: 'Base Desc',
        local_value: 'Local Desc',
        server_value: 'Server Desc',
      },
    ],
  });
}

test('ConflictService.createConflict produces a valid Conflict', () => {
  const conflict = makeTestConflict();

  expect(conflict.id).toMatch(/^conflict-/);
  expect(conflict.status).toBe('unresolved');
  expect(conflict.entity_type).toBe('product');
  expect(conflict.entity_id).toBe('prod-1');
  expect(conflict.entity_name).toBe('Test Product');
  expect(conflict.base_revision).toBe(5);
  expect(conflict.fields).toHaveLength(2);
  expect(conflict.fields[0].field).toBe('name');
  expect(conflict.fields[0].base_value).toBe('Base Name');
  expect(conflict.fields[0].local_value).toBe('Local Name');
  expect(conflict.fields[0].server_value).toBe('Server Name');
  expect(conflict.fields[0].resolution).toBe('unresolved');
  expect(conflict.fields[1].resolution).toBe('unresolved');
  expect(conflict.retry_count).toBe(0);
  expect(conflict.resolution_audit).toEqual([]);
  expect(conflict.created_at).toBeTruthy();
  expect(conflict.updated_at).toBeTruthy();
});

test('resolveField updates the field resolution', () => {
  const service = new ConflictService();
  const conflict = makeTestConflict();

  const result = service.resolveField(conflict, 'name', 'local');

  expect(result.ok).toBe(true);
  expect(conflict.fields[0].resolution).toBe('local');
  expect(conflict.fields[0].resolved_at).toBeTruthy();
  expect(conflict.updated_at).toBeTruthy();
});

test('resolveField with manual resolution stores manual_value', () => {
  const service = new ConflictService();
  const conflict = makeTestConflict();

  const result = service.resolveField(conflict, 'name', 'manual', 'Custom Value');

  expect(result.ok).toBe(true);
  expect(conflict.fields[0].resolution).toBe('manual');
  expect(conflict.fields[0].manual_value).toBe('Custom Value');
});

test('resolveField on all fields transitions status to resolved', () => {
  const service = new ConflictService();
  const conflict = makeTestConflict();

  service.resolveField(conflict, 'name', 'local');
  expect(conflict.status).toBe('unresolved');

  service.resolveField(conflict, 'description', 'server');
  expect(conflict.status).toBe('resolved');
});

test('retry transitions from unresolved to retrying', () => {
  const service = new ConflictService();
  const conflict = makeTestConflict();

  const result = service.retry(conflict);

  expect(result.ok).toBe(true);
  expect(conflict.status).toBe('retrying');
});

test('retry preserves field resolutions', () => {
  const service = new ConflictService();
  const conflict = makeTestConflict();

  service.resolveField(conflict, 'name', 'local');
  service.retry(conflict);

  expect(conflict.status).toBe('retrying');
  expect(conflict.fields[0].resolution).toBe('local');
  expect(conflict.fields[1].resolution).toBe('unresolved');
});

test('failRetry increments retry_count and stores last_error', () => {
  const service = new ConflictService();
  const conflict = makeTestConflict();

  service.retry(conflict);
  const result = service.failRetry(conflict, 'Connection timeout');

  expect(result.ok).toBe(true);
  expect(conflict.status).toBe('failed');
  expect(conflict.retry_count).toBe(1);
  expect(conflict.last_error).toBe('Connection timeout');
});

test('failRetry only works when status is retrying', () => {
  const service = new ConflictService();
  const conflict = makeTestConflict();

  const result = service.failRetry(conflict, 'Some error');

  expect(result.ok).toBe(false);
  expect(result.error).toContain('unless retrying');
  expect(conflict.status).toBe('unresolved');
});

test('resolveField on a resolved conflict returns error', () => {
  const service = new ConflictService();
  const conflict = makeTestConflict();

  service.resolveField(conflict, 'name', 'local');
  service.resolveField(conflict, 'description', 'server');

  const result = service.resolveField(conflict, 'name', 'server');

  expect(result.ok).toBe(false);
  expect(result.error).toContain('already resolved');
});

test('retry on a resolved conflict returns error', () => {
  const service = new ConflictService();
  const conflict = makeTestConflict();

  service.resolveField(conflict, 'name', 'local');
  service.resolveField(conflict, 'description', 'server');

  const result = service.retry(conflict);

  expect(result.ok).toBe(false);
  expect(result.error).toContain('Cannot retry a resolved conflict');
});

test('resolution_audit tracks all resolution actions', () => {
  const service = new ConflictService();
  const conflict = makeTestConflict();

  service.resolveField(conflict, 'name', 'local');
  service.resolveField(conflict, 'description', 'server');

  expect(conflict.resolution_audit).toHaveLength(2);
  expect(conflict.resolution_audit[0].field).toBe('name');
  expect(conflict.resolution_audit[0].from).toBe('unresolved');
  expect(conflict.resolution_audit[0].to).toBe('local');
  expect(conflict.resolution_audit[1].field).toBe('description');
  expect(conflict.resolution_audit[1].from).toBe('unresolved');
  expect(conflict.resolution_audit[1].to).toBe('server');
});

test('resolveField with non-existent field returns error', () => {
  const service = new ConflictService();
  const conflict = makeTestConflict();

  const result = service.resolveField(conflict, 'nonexistent', 'local');

  expect(result.ok).toBe(false);
  expect(result.error).toContain('not found in conflict');
});

test('failRetry can be called multiple times, incrementing retry_count each time', () => {
  const service = new ConflictService();
  const conflict = makeTestConflict();

  service.retry(conflict);
  service.failRetry(conflict, 'Error 1');
  expect(conflict.retry_count).toBe(1);
  expect(conflict.status).toBe('failed');

  service.retry(conflict);
  service.failRetry(conflict, 'Error 2');
  expect(conflict.retry_count).toBe(2);
  expect(conflict.last_error).toBe('Error 2');
});
