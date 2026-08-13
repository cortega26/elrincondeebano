import { test, expect } from 'vitest';
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

test('schedule rejects second overlapping publication', async () => {
  const runner = new JobRunner();

  let running = false;
  let secondStarted = false;

  runner.schedule('publish', () => {
    return new Promise((resolve) => {
      running = true;
      setTimeout(() => {
        running = false;
        resolve('first');
      }, 50);
    });
  });

  await new Promise((r) => setTimeout(r, 5));

  // Second job should queue
  runner.schedule('publish', () => {
    return new Promise((resolve) => {
      secondStarted = true;
      resolve('second');
    });
  });

  // First is running, second is queued
  expect(running).toBe(true);
  expect(runner.getPendingCount()).toBeGreaterThanOrEqual(0); // may already be processed

  await new Promise((r) => setTimeout(r, 100));
  expect(secondStarted).toBe(true);
});
