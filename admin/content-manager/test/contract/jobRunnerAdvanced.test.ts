import { test, expect, vi } from 'vitest';
import { JobRunner } from '../../src/server/services/jobRunner.ts';

test('cancel during a running job marks it failed/cancelled', async () => {
  const runner = new JobRunner();

  const job = runner.schedule<string>('test-cancel', () => {
    return new Promise((resolve, reject) => {
      // Simulate work that checks cancel flag
      setTimeout(() => {
        if (job.cancelRequested) {
          reject(new Error('Cancelled by operator'));
        } else {
          resolve('done');
        }
      }, 50);
    });
  });

  await new Promise((r) => setTimeout(r, 10));

  // Cancel while running
  runner.cancelJob(job.id);

  // Wait for job to finish
  await new Promise((r) => setTimeout(r, 100));

  const final = runner.getJob(job.id);
  expect(final).toBeDefined();
  // Either cancelled (if caught) or failed (if thrown)
  expect(['cancelled', 'failed'].includes(final!.status)).toBe(true);
});

test('shutdown cancels a running job', async () => {
  const runner = new JobRunner();

  const job = runner.schedule<string>('test-shutdown', () => {
    return new Promise(() => {
      // Never resolves — shutdown should cancel it
    });
  });

  await new Promise((r) => setTimeout(r, 10));
  await runner.shutdown();

  const final = runner.getJob(job.id);
  expect(final!.cancelRequested).toBe(true);
});

test('schedule queues a second publication until the first finishes', async () => {
  const runner = new JobRunner();

  let running = false;
  let secondStarted = false;

  const first = runner.schedule('publish', () => {
    return new Promise((resolve) => {
      running = true;
      setTimeout(() => {
        running = false;
        resolve('first');
      }, 50);
    });
  });

  await vi.waitFor(() => expect(runner.getJob(first.id)?.status).toBe('running'), {
    timeout: 2000,
    interval: 10,
  });

  runner.schedule('publish', () => {
    return new Promise((resolve) => {
      secondStarted = true;
      resolve('second');
    });
  });

  expect(running).toBe(true);
  expect(secondStarted).toBe(false);
  expect(runner.getPendingCount()).toBe(1);

  await vi.waitFor(() => expect(secondStarted).toBe(true), { timeout: 2000, interval: 10 });
  expect(running).toBe(false);
});
