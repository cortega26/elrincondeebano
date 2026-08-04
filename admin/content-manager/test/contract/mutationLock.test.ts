import { test, expect } from 'vitest';
import { MutationLock } from '../../src/server/services/mutationLock.ts';

test('MutationLock acquires and releases', async () => {
  const lock = new MutationLock();

  const release = await lock.acquire();
  expect(lock.isLocked).toBe(true);

  release();
  expect(lock.isLocked).toBe(false);
});

test('MutationLock queues waiters', async () => {
  const lock = new MutationLock();
  const order: number[] = [];

  const release1 = await lock.acquire();
  order.push(1);

  const promise2 = lock.acquire().then((r) => {
    order.push(2);
    return r;
  });

  await new Promise((r) => setTimeout(r, 10));
  expect(order).toEqual([1]);
  expect(lock.isLocked).toBe(true);

  release1();
  const release2 = await promise2;
  expect(order).toEqual([1, 2]);
  expect(lock.isLocked).toBe(true);

  release2();
  expect(lock.isLocked).toBe(false);
});

test('MutationLock supports sequential acquire-release cycles', async () => {
  const lock = new MutationLock();

  for (let i = 0; i < 3; i++) {
    const release = await lock.acquire();
    expect(lock.isLocked).toBe(true);
    release();
    expect(lock.isLocked).toBe(false);
  }
});
