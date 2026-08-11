import { test, expect } from 'vitest';
import { createApp } from '../../src/server/app.ts';
import { CREDENTIAL_HEADER } from '../../src/server/security/launchCredential.ts';
import type { FastifyInstance } from 'fastify';
import { ConflictService } from '../../src/domain/conflicts/conflictService.ts';
import { ConflictRepository } from '../../src/server/repositories/conflictRepository.ts';
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';

function credHeaders(app: FastifyInstance): Record<string, string> {
  const cred = (app as unknown as { launchCredential?: string }).launchCredential ?? '';
  return { [CREDENTIAL_HEADER]: cred };
}

function createTempDir(): string {
  const dir = resolve(
    tmpdir(),
    `cm-conflict-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  return dir;
}

function createTestConflict(): ReturnType<ConflictService['createConflict']> {
  const service = new ConflictService();
  return service.createConflict({
    entity_type: 'product',
    entity_id: 'prod-test-1',
    entity_name: 'Test Product',
    base_revision: 10,
    local_snapshot: { name: 'Local Name', price: 100 },
    server_snapshot: { name: 'Server Name', price: 150 },
    fields: [
      {
        field: 'name',
        base_value: 'Base Name',
        local_value: 'Local Name',
        server_value: 'Server Name',
      },
      { field: 'price', base_value: 100, local_value: 100, server_value: 150 },
    ],
  });
}

test('GET /api/v1/conflicts returns empty list when no conflicts exist', async () => {
  const dir = createTempDir();
  try {
    const app = createApp({ repoRoot: dir, logger: false });
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/api/v1/conflicts' });
    expect(response.statusCode).toBe(200);

    const body = response.json<{ conflicts: unknown[]; summary: { total: number } }>();
    expect(body.conflicts).toEqual([]);
    expect(body.summary.total).toBe(0);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('GET /api/v1/conflicts returns saved conflicts', async () => {
  const dir = createTempDir();
  try {
    const repo = new ConflictRepository(dir);
    const conflict = createTestConflict();
    repo.save(conflict);

    const app = createApp({ repoRoot: dir, logger: false });
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/api/v1/conflicts' });
    expect(response.statusCode).toBe(200);

    const body = response.json<{
      conflicts: Array<{ id: string; entity_name: string; status: string; fields: unknown[] }>;
      summary: { unresolved: number; total: number };
    }>();
    expect(body.conflicts).toHaveLength(1);
    expect(body.conflicts[0].id).toBe(conflict.id);
    expect(body.conflicts[0].entity_name).toBe('Test Product');
    expect(body.conflicts[0].status).toBe('unresolved');
    expect(body.conflicts[0].fields).toHaveLength(2);
    expect(body.summary.unresolved).toBe(1);
    expect(body.summary.total).toBe(1);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('POST /api/v1/conflicts/:id/resolve resolves a field', async () => {
  const dir = createTempDir();
  try {
    const repo = new ConflictRepository(dir);
    const conflict = createTestConflict();
    repo.save(conflict);

    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/conflicts/${conflict.id}/resolve`,
      headers: credHeaders(app),
      payload: { field: 'name', resolution: 'local' },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{
      status: string;
      fields: Array<{ field: string; resolution: string; resolved_at?: string }>;
      resolution_audit: unknown[];
    }>();
    expect(body.fields[0].resolution).toBe('local');
    expect(body.fields[0].resolved_at).toBeTruthy();
    expect(body.resolution_audit).toHaveLength(1);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('POST /api/v1/conflicts/:id/resolve adds resolution audit log', async () => {
  const dir = createTempDir();
  try {
    const repo = new ConflictRepository(dir);
    const conflict = createTestConflict();
    repo.save(conflict);

    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/conflicts/${conflict.id}/resolve`,
      headers: credHeaders(app),
      payload: { field: 'name', resolution: 'server' },
    });

    const body = response.json<{
      resolution_audit: Array<{ field: string; from: string; to: string }>;
    }>();
    expect(body.resolution_audit).toHaveLength(1);
    expect(body.resolution_audit[0].field).toBe('name');
    expect(body.resolution_audit[0].from).toBe('unresolved');
    expect(body.resolution_audit[0].to).toBe('server');

    // Persisted: reload and verify
    const reloaded = repo.load(conflict.id);
    expect(reloaded?.resolution_audit).toHaveLength(1);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('POST /api/v1/conflicts/:id/resolve returns 404 for missing conflict', async () => {
  const dir = createTempDir();
  try {
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/conflicts/nonexistent/resolve',
      headers: credHeaders(app),
      payload: { field: 'name', resolution: 'local' },
    });

    expect(response.statusCode).toBe(404);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('POST /api/v1/conflicts/:id/resolve returns 400 when no body is sent', async () => {
  const dir = createTempDir();
  try {
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/conflicts/nonexistent/resolve',
      headers: credHeaders(app),
    });

    expect(response.statusCode).toBe(400);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('POST /api/v1/conflicts/:id/resolve returns 409 when conflict is resolved', async () => {
  const dir = createTempDir();
  const conflictService = new ConflictService();
  try {
    const repo = new ConflictRepository(dir);
    const conflict = createTestConflict();
    conflictService.resolveField(conflict, 'name', 'local');
    conflictService.resolveField(conflict, 'price', 'server');
    repo.save(conflict);

    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/conflicts/${conflict.id}/resolve`,
      headers: credHeaders(app),
      payload: { field: 'name', resolution: 'local' },
    });

    expect(response.statusCode).toBe(409);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('POST /api/v1/conflicts/:id/retry transitions to retrying', async () => {
  const dir = createTempDir();
  try {
    const repo = new ConflictRepository(dir);
    const conflict = createTestConflict();
    repo.save(conflict);

    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/conflicts/${conflict.id}/retry`,
      headers: credHeaders(app),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ status: string }>();
    expect(body.status).toBe('retrying');

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('POST /api/v1/conflicts/:id/retry returns 409 for resolved conflict', async () => {
  const conflictService = new ConflictService();
  const dir = createTempDir();
  try {
    const repo = new ConflictRepository(dir);
    const conflict = createTestConflict();
    conflictService.resolveField(conflict, 'name', 'local');
    conflictService.resolveField(conflict, 'price', 'server');
    repo.save(conflict);

    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/conflicts/${conflict.id}/retry`,
      headers: credHeaders(app),
    });

    expect(response.statusCode).toBe(409);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('GET /api/v1/conflicts?status=unresolved filters correctly', async () => {
  const dir = createTempDir();
  try {
    const repo = new ConflictRepository(dir);
    const conflictService = new ConflictService();

    const c1 = createTestConflict();
    repo.save(c1);

    const c2 = createTestConflict();
    conflictService.retry(c2);
    conflictService.failRetry(c2, 'Test error');
    repo.save(c2);

    const app = createApp({ repoRoot: dir, logger: false });
    await app.ready();

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/conflicts?status=unresolved',
    });
    const body = response.json<{
      conflicts: Array<{ id: string }>;
      summary: { unresolved: number };
    }>();
    expect(body.conflicts).toHaveLength(1);
    expect(body.conflicts[0].id).toBe(c1.id);
    expect(body.summary.unresolved).toBe(1);

    const failedRes = await app.inject({ method: 'GET', url: '/api/v1/conflicts?status=failed' });
    const failedBody = failedRes.json<{
      conflicts: Array<{ id: string }>;
      summary: { failed: number };
    }>();
    expect(failedBody.conflicts).toHaveLength(1);
    expect(failedBody.conflicts[0].id).toBe(c2.id);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('GET /api/v1/conflicts reading does NOT mutate any conflict fields', async () => {
  const dir = createTempDir();
  try {
    const repo = new ConflictRepository(dir);
    const conflict = createTestConflict();
    repo.save(conflict);

    const app = createApp({ repoRoot: dir, logger: false });
    await app.ready();

    // Read twice
    const res1 = await app.inject({ method: 'GET', url: '/api/v1/conflicts' });
    const res2 = await app.inject({ method: 'GET', url: '/api/v1/conflicts' });

    const body1 = res1.json<{
      conflicts: Array<{ status: string; fields: Array<{ resolution: string }> }>;
    }>();
    const body2 = res2.json<{
      conflicts: Array<{ status: string; fields: Array<{ resolution: string }> }>;
    }>();

    expect(body1.conflicts[0].status).toBe('unresolved');
    expect(body1.conflicts[0].fields[0].resolution).toBe('unresolved');
    expect(body2.conflicts[0].status).toBe('unresolved');
    expect(body2.conflicts[0].fields[0].resolution).toBe('unresolved');

    // Verify on disk unchanged
    const onDisk = repo.load(conflict.id);
    expect(onDisk?.status).toBe('unresolved');
    expect(onDisk?.fields[0].resolution).toBe('unresolved');

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('GET /api/v1/sync/status returns sync config', async () => {
  const dir = createTempDir();
  try {
    const app = createApp({ repoRoot: dir, logger: false });
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/api/v1/sync/status' });
    expect(response.statusCode).toBe(200);

    const body = response.json<{
      sync: {
        enabled: boolean;
        poll_interval: number;
        pull_interval: number;
        queue: { total: number };
      };
      capabilities: { push: string; pull: string };
    }>();
    expect(body.sync.enabled).toBe(false);
    expect(body.sync.poll_interval).toBe(60);
    expect(body.sync.pull_interval).toBe(300);
    expect(body.sync.queue.total).toBe(0);
    expect(body.capabilities.push).toBe('implemented');
    expect(body.capabilities.pull).toBe('implemented');

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('POST /api/v1/conflicts/:id/resolve with manual value stores it in field', async () => {
  const dir = createTempDir();
  try {
    const repo = new ConflictRepository(dir);
    const conflict = createTestConflict();
    repo.save(conflict);

    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/conflicts/${conflict.id}/resolve`,
      headers: credHeaders(app),
      payload: { field: 'name', resolution: 'manual', manual_value: 'Custom Resolution' },
      headers: credHeaders(app),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ fields: Array<{ resolution: string; manual_value: unknown }> }>();
    expect(body.fields[0].resolution).toBe('manual');
    expect(body.fields[0].manual_value).toBe('Custom Resolution');

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
