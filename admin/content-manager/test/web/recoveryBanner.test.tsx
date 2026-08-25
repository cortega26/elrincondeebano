// @vitest-environment jsdom
// Plan 127 F3.3: the recovery banner — shown when diagnostics report a
// pending recovery, hidden otherwise.

import { render, screen, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { mockApi } from './harness.tsx';
import { RecoveryBanner } from '@web/app/components/RecoveryBanner.tsx';

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  // Default: no recovery, so the banner stays hidden unless a test overrides.
  mockApi.getDiagnostics.mockResolvedValue({ recoveryNeeded: false } as unknown as Awaited<
    ReturnType<typeof mockApi.getDiagnostics>
  >);
  // jsdom has no fetch — keep a stub for any remaining fetchWithCredential paths.
  if (!globalThis.fetch || (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock) {
    globalThis.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({}), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
    ) as unknown as typeof fetch;
  }
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('RecoveryBanner (plan 127 F3.3)', () => {
  test('shows the alert and the Diagnostics link when recovery is pending', async () => {
    mockApi.getDiagnostics.mockResolvedValue({ recoveryNeeded: true } as unknown as Awaited<
      ReturnType<typeof mockApi.getDiagnostics>
    >);
    const root = render(
      <MemoryRouter>
        <RecoveryBanner />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    expect(screen.getByRole('link', { name: 'Diagnósticos' })).toBeInTheDocument();
    root.unmount();
  });

  test('renders nothing when no recovery is pending', async () => {
    mockApi.getDiagnostics.mockResolvedValue({ recoveryNeeded: false } as unknown as Awaited<
      ReturnType<typeof mockApi.getDiagnostics>
    >);
    const root = render(
      <MemoryRouter>
        <RecoveryBanner />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(mockApi.getDiagnostics).toHaveBeenCalled();
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    root.unmount();
  });

  test('keeps previous state when diagnostics fetch rejects (plan 143)', async () => {
    const setIntervalSpy = vi.spyOn(window, 'setInterval');
    mockApi.getDiagnostics.mockResolvedValueOnce({ recoveryNeeded: true } as unknown as Awaited<
      ReturnType<typeof mockApi.getDiagnostics>
    >);
    const root = render(
      <MemoryRouter>
        <RecoveryBanner />
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 30000);
    const cb = setIntervalSpy.mock.calls[0][0] as () => void;
    mockApi.getDiagnostics.mockRejectedValueOnce(new Error('network down'));
    await act(async () => {
      await (cb as unknown as () => Promise<void>)();
    });
    expect(mockApi.getDiagnostics).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    root.unmount();
    setIntervalSpy.mockRestore();

    vi.clearAllMocks();
    mockApi.getDiagnostics.mockResolvedValueOnce({ recoveryNeeded: false } as unknown as Awaited<
      ReturnType<typeof mockApi.getDiagnostics>
    >);
    const setIntervalSpy2 = vi.spyOn(window, 'setInterval');
    const root2 = render(
      <MemoryRouter>
        <RecoveryBanner />
      </MemoryRouter>
    );
    await waitFor(() => expect(mockApi.getDiagnostics).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(setIntervalSpy2).toHaveBeenCalledWith(expect.any(Function), 30000);
    const cb2 = setIntervalSpy2.mock.calls[0][0] as () => void;
    mockApi.getDiagnostics.mockRejectedValueOnce(new Error('offline'));
    await act(async () => {
      await (cb2 as unknown as () => Promise<void>)();
    });
    expect(mockApi.getDiagnostics).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    root2.unmount();
    setIntervalSpy2.mockRestore();
  });

  test('polls diagnostics every 30s (plan 143)', async () => {
    vi.useFakeTimers();
    mockApi.getDiagnostics.mockResolvedValue({ recoveryNeeded: false } as unknown as Awaited<
      ReturnType<typeof mockApi.getDiagnostics>
    >);
    const root = render(
      <MemoryRouter>
        <RecoveryBanner />
      </MemoryRouter>
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(mockApi.getDiagnostics).toHaveBeenCalledTimes(1);

    mockApi.getDiagnostics.mockClear();
    await vi.advanceTimersByTimeAsync(30_000);
    await Promise.resolve();
    expect(mockApi.getDiagnostics).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(30_000);
    await Promise.resolve();
    expect(mockApi.getDiagnostics).toHaveBeenCalledTimes(2);

    root.unmount();
    vi.useRealTimers();
  });

  test('clears interval on unmount and does not set state after unmount (plan 143)', async () => {
    vi.useFakeTimers();
    const clearSpy = vi.spyOn(window, 'clearInterval');
    mockApi.getDiagnostics.mockResolvedValue({ recoveryNeeded: false } as unknown as Awaited<
      ReturnType<typeof mockApi.getDiagnostics>
    >);
    const root = render(
      <MemoryRouter>
        <RecoveryBanner />
      </MemoryRouter>
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(clearSpy).not.toHaveBeenCalled();
    root.unmount();
    expect(clearSpy).toHaveBeenCalledTimes(1);
    mockApi.getDiagnostics.mockClear();
    await vi.advanceTimersByTimeAsync(30_000);
    await Promise.resolve();
    expect(mockApi.getDiagnostics).not.toHaveBeenCalled();
    vi.useRealTimers();
    clearSpy.mockRestore();
  });
});
