// @vitest-environment jsdom
// Plan 127 F3.3: the recovery banner — shown when diagnostics report a
// pending recovery, hidden otherwise.

import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { RecoveryBanner } from '@web/app/components/RecoveryBanner.tsx';

const mockFetch = vi.fn();

beforeEach(() => {
  globalThis.fetch = mockFetch as unknown as typeof fetch;
});

afterEach(() => {
  mockFetch.mockReset();
});

describe('RecoveryBanner (plan 127 F3.3)', () => {
  test('shows the alert and the Diagnostics link when recovery is pending', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ recoveryNeeded: true }), { status: 200 })
    );
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
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ recoveryNeeded: false }), { status: 200 })
    );
    const root = render(
      <MemoryRouter>
        <RecoveryBanner />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    root.unmount();
  });
});
