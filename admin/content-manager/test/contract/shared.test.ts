import { test, expect } from 'vitest';
import { DomainError } from '../../src/shared/errors/AppError.ts';
import type { CommandEnvelope, CommandResult } from '../../src/shared/commands/envelope.ts';

test('DomainError creates a typed error', () => {
  const error = new DomainError('VALIDATION_ERROR', 'El nombre es obligatorio', {
    field: 'name',
  });

  expect(error).toBeInstanceOf(Error);
  expect(error.name).toBe('DomainError');
  expect(error.code).toBe('VALIDATION_ERROR');
  expect(error.message).toBe('El nombre es obligatorio');
  expect(error.details).toEqual({ field: 'name' });
});

test('CommandEnvelope has correct shape', () => {
  const envelope: CommandEnvelope<{ name: string }> = {
    command_id: 'abc-123',
    entity_id: 'prod-1',
    base_revision: 5,
    issued_at: new Date().toISOString(),
    payload: { name: 'Test' },
  };

  expect(envelope.command_id).toBe('abc-123');
  expect(envelope.base_revision).toBe(5);
  expect(envelope.payload.name).toBe('Test');
});

test('CommandResult has correct shape for success', () => {
  const result: CommandResult = {
    command_id: 'abc-123',
    status: 'ok',
    resulting_revision: 6,
    changed_fields: ['name'],
    audit_reference: 'audit-001',
  };

  expect(result.status).toBe('ok');
  expect(result.resulting_revision).toBe(6);
});

test('CommandResult has correct shape for conflict', () => {
  const result: CommandResult = {
    command_id: 'abc-123',
    status: 'conflict',
    conflicts: [
      {
        entity_id: 'prod-1',
        field: 'price',
        local_value: 2000,
        base_value: 1500,
        server_value: 3000,
      },
    ],
  };

  expect(result.status).toBe('conflict');
  expect(result.conflicts).toHaveLength(1);
  expect(result.conflicts![0].field).toBe('price');
});
