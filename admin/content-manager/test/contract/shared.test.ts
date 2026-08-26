import { test, expect } from 'vitest';
import { HttpError, sanitizeUserMessage } from '../../src/shared/errors/AppError.ts';
import type { CommandEnvelope, CommandResult } from '../../src/shared/commands/envelope.ts';

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

// ── plan 090: error sanitization ─────────────────────────────────────────────

test('HttpError carries a public code/message and optional details', () => {
  const error = new HttpError(
    500,
    'INTERNAL_ERROR',
    'Internal server error',
    '/home/secret/data.json'
  );
  expect(error).toBeInstanceOf(Error);
  expect(error.statusCode).toBe(500);
  expect(error.code).toBe('INTERNAL_ERROR');
  expect(error.message).toBe('Internal server error');
  expect(error.details).toBe('/home/secret/data.json');
});

test('sanitizeUserMessage strips filesystem paths and long tokens', () => {
  expect(sanitizeUserMessage('Cannot read /home/carlos/x/data.json: ENOENT')).toBe(
    'Cannot read [path] ENOENT'
  );
  expect(sanitizeUserMessage('Schema failed for C:\\Users\\carlos\\repo\\data.json')).not.toContain(
    'Users'
  );
  expect(sanitizeUserMessage('token a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8g9h0')).not.toMatch(
    /\b[A-Za-z0-9_-]{32,}\b/
  );
  expect(sanitizeUserMessage('normal message')).toBe('normal message');
});
