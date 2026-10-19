// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { useFeedback } from '@web/app/hooks/useFeedback.ts';
import { useResource } from '@web/app/hooks/useResource.ts';

// Plan 242: controllable promises let the test decide the settlement order
// of two in-flight requests (the race the monotonic guard must survive).
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('useResource', () => {
  test('exposes data/loading once the fetch settles', async () => {
    const first = deferred<string>();
    const { result } = renderHook(() => useResource(() => first.promise, []));

    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeNull();

    await act(async () => {
      first.resolve('done');
      await first.promise;
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.data).toBe('done');
    expect(result.current.error).toBeNull();
  });

  test('a slow older response never overwrites the newest one (race guard)', async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    const fetcher = vi
      .fn<() => Promise<string>>()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    const { result } = renderHook(() => useResource(fetcher, []));

    act(() => {
      result.current.reload();
    });
    expect(fetcher).toHaveBeenCalledTimes(2);

    // The newest request settles first…
    await act(async () => {
      second.resolve('new');
      await second.promise;
    });
    expect(result.current.data).toBe('new');
    expect(result.current.loading).toBe(false);

    // …and the stale response landing later changes nothing.
    await act(async () => {
      first.resolve('old');
      await first.promise;
    });
    expect(result.current.data).toBe('new');
    expect(result.current.error).toBeNull();
  });

  test('captures the thrown Error message and stops loading', async () => {
    const fetcher = async (): Promise<string> => {
      throw new Error('boom');
    };
    const { result } = renderHook(() => useResource(fetcher, []));

    await waitFor(() => expect(result.current.error).toBe('boom'));
    expect(result.current.loading).toBe(false);
    expect(result.current.data).toBeNull();
  });
});

describe('useFeedback', () => {
  test('notify stores kind + message, clear resets', () => {
    const { result } = renderHook(() => useFeedback());

    act(() => {
      result.current.notify('success', 'listo');
    });
    expect(result.current.feedback).toEqual({ kind: 'success', message: 'listo' });

    act(() => {
      result.current.clear();
    });
    expect(result.current.feedback).toBeNull();
  });
});
