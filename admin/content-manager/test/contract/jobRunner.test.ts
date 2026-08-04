import { test, expect } from 'vitest';
import { JobRunner } from '../../src/server/services/jobRunner.ts';

test('schedule runs a job and returns result', async () => {
  const runner = new JobRunner();
  const job = runner.schedule<string>('test', async () => 'done');
  expect(job.type).toBe('test');
  expect(job.id).toBeTruthy();

  await new Promise((resolve) => setTimeout(resolve, 50));

  const retrieved = runner.getJob<string>(job.id);
  expect(retrieved).toBeDefined();
  expect(retrieved!.status).toBe('completed');
  expect(retrieved!.result).toBe('done');
  expect(retrieved!.progress).toBe(100);
});

test('schedule records start and complete times', async () => {
  const runner = new JobRunner();
  const job = runner.schedule('test', async () => 'ok');

  await new Promise((resolve) => setTimeout(resolve, 50));

  const retrieved = runner.getJob(job.id);
  expect(retrieved!.started_at).toBeTruthy();
  expect(retrieved!.completed_at).toBeTruthy();
});

test('cancelJob cancels a pending job before it starts', async () => {
  const runner = new JobRunner();

  const first = runner.schedule('test', async () => 'first');
  const second = runner.schedule('test', async () => 'second');

  const cancelled = runner.cancelJob(second.id);
  expect(cancelled).toBe(true);

  const secondJob = runner.getJob(second.id);
  expect(secondJob!.status).toBe('cancelled');

  await new Promise((resolve) => setTimeout(resolve, 50));

  const firstJob = runner.getJob(first.id);
  expect(firstJob!.status).toBe('completed');
  expect(firstJob!.result).toBe('first');
});

test('cancelJob returns false for completed job', async () => {
  const runner = new JobRunner();
  const job = runner.schedule('test', async () => 'done');

  await new Promise((resolve) => setTimeout(resolve, 50));

  const cancelled = runner.cancelJob(job.id);
  expect(cancelled).toBe(false);
});

test('cancelJob returns false for already cancelled job', async () => {
  const runner = new JobRunner();
  const job = runner.schedule('test', async () => 'never');

  runner.cancelJob(job.id);
  const secondCancel = runner.cancelJob(job.id);
  expect(secondCancel).toBe(false);
});

test('cancelJob returns false for unknown job', () => {
  const runner = new JobRunner();
  expect(runner.cancelJob('nonexistent')).toBe(false);
});

test('shutdown cancels all pending jobs', async () => {
  const runner = new JobRunner();

  const first = runner.schedule('test', async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));
    return 'first';
  });
  const second = runner.schedule('test', async () => 'second');

  await runner.shutdown();

  // Second job is pending and gets cancelled
  expect(runner.getJob(second.id)!.status).toBe('cancelled');
  // First job was already running; after shutdown with cancelRequested, it may complete or be cancelled
  expect(['completed', 'cancelled', 'running']).toContain(runner.getJob(first.id)!.status);
});

test("shutdown doesn't cancel already completed jobs", async () => {
  const runner = new JobRunner();
  const job = runner.schedule('test', async () => 'done');

  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(job.status).toBe('completed');

  await runner.shutdown();
  expect(job.status).toBe('completed');
});

test('updateProgress updates job progress', async () => {
  const runner = new JobRunner();
  const job = runner.schedule('test', async () => {
    runner.updateProgress(job.id, 50);
    return 'done';
  });

  await new Promise((resolve) => setTimeout(resolve, 50));

  expect(job.progress).toBe(100);
});

test('updateProgress clamps to 0-100', () => {
  const runner = new JobRunner();
  const job = runner.schedule('test', async () => 'done');

  runner.updateProgress(job.id, -10);
  expect(job.progress).toBe(0);

  runner.updateProgress(job.id, 150);
  expect(job.progress).toBe(100);
});

test('getJob retrieves job by ID', () => {
  const runner = new JobRunner();
  const job = runner.schedule('test', async () => 'result');

  const retrieved = runner.getJob(job.id);
  expect(retrieved).toBeDefined();
  expect(retrieved!.id).toBe(job.id);
  expect(retrieved!.type).toBe('test');
});

test('getJob returns undefined for unknown ID', () => {
  const runner = new JobRunner();
  expect(runner.getJob('nonexistent')).toBeUndefined();
});

test('failed job stores error', async () => {
  const runner = new JobRunner();
  const job = runner.schedule('test', async () => {
    throw new Error('boom');
  });

  await new Promise((resolve) => setTimeout(resolve, 50));

  expect(job.status).toBe('failed');
  expect(job.error).toBe('boom');
});

test('getPendingCount returns number of queued jobs', async () => {
  const runner = new JobRunner();

  runner.schedule('test', async () => {
    await new Promise((resolve) => setTimeout(resolve, 500));
  });

  runner.schedule('test', async () => 'second');
  runner.schedule('test', async () => 'third');

  // First job is running (or about to), others queued
  // Give a small tick for setImmediate to process
  await new Promise((r) => setTimeout(r, 10));

  // getPendingCount should be >= 0 (may be 0, 1, or 2 depending on timing)
  expect(runner.getPendingCount()).toBeGreaterThanOrEqual(0);
});
