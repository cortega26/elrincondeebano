// @vitest-environment jsdom
// Plan 177: admin feedback papercuts — badge honesty, sync-form preservation,
// export error surfacing. (Share-button honesty lives in test/cart-view.spec.js.)

import { screen, waitFor, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderWithRouter, mockApi, productA } from './harness.tsx';
import { ProductsPage } from '@web/app/routes/ProductsPage.tsx';

const SYNC_SHAPE = {
  enabled: false,
  api_base: null,
  poll_interval: 60,
  pull_interval: 300,
  paused: false,
  token_configured: false,
  queue: { pending: 0, error: 0, total: 0 },
  next_attempt: null,
  last_push: null,
  last_pull: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockApi.getProducts.mockResolvedValue({
    items: [productA],
    total: 1,
    page: 1,
    pageSize: 50,
  });
  mockApi.getCategories.mockResolvedValue({ categories: [] } as unknown as Awaited<
    ReturnType<typeof mockApi.getCategories>
  >);
  mockApi.getSyncStatus.mockResolvedValue({
    sync: SYNC_SHAPE,
    capabilities: { push: 'implemented', pull: 'implemented' },
  } as unknown as Awaited<ReturnType<typeof mockApi.getSyncStatus>>);
  mockApi.getDiagnostics.mockResolvedValue({ recoveryNeeded: false } as unknown as Awaited<
    ReturnType<typeof mockApi.getDiagnostics>
  >);
  mockApi.getMedia.mockResolvedValue({
    items: [],
    summary: { total: 0, active: 0, orphans: 0, generated: 0, staged: 0, missing: 0 },
    intents: [],
  } as unknown as Awaited<ReturnType<typeof mockApi.getMedia>>);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ProductsPage feedback (plan 177)', () => {
  test('filter badge ignores the archived baseline but counts real filters', async () => {
    const user = userEvent.setup();
    renderWithRouter(<ProductsPage />);
    await waitFor(() => expect(screen.getByText('Producto A')).toBeInTheDocument());

    // Baseline is not a filter: no badge, nothing to clear.
    expect(screen.queryByText(/Filtros activos/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: 'Solo descuento' }));
    await waitFor(() => expect(screen.getByText(/Filtros activos: 1/)).toBeInTheDocument());

    // Limpiar returns to a badgeless baseline (pre-fix it survived forever).
    await user.click(screen.getByRole('button', { name: 'Limpiar' }));
    await waitFor(() => expect(screen.queryByText(/Filtros activos/)).not.toBeInTheDocument());
  });

  test('sync poll does not reset the config form while it is open', async () => {
    const user = userEvent.setup();
    renderWithRouter(<ProductsPage />);
    await waitFor(() => expect(screen.getByText('Producto A')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Configurar' }));
    const input = screen.getByPlaceholderText('api_base') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'http://typed:9999' } });
    expect(input.value).toBe('http://typed:9999');

    // The server now reports different values; the 30s poll must refresh
    // status only, never the open form.
    mockApi.getSyncStatus.mockResolvedValue({
      sync: { ...SYNC_SHAPE, enabled: true, api_base: 'http://server:1' },
      capabilities: { push: 'implemented', pull: 'implemented' },
    } as unknown as Awaited<ReturnType<typeof mockApi.getSyncStatus>>);
    vi.useFakeTimers();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(31_000);
    });
    vi.useRealTimers();

    expect((screen.getByPlaceholderText('api_base') as HTMLInputElement).value).toBe(
      'http://typed:9999'
    );
  });

  test('failed JSON export surfaces an error instead of vanishing', async () => {
    renderWithRouter(<ProductsPage />);
    await waitFor(() => expect(screen.getByText('Producto A')).toBeInTheDocument());

    mockApi.exportJson.mockRejectedValueOnce(new Error('Export falló'));
    fireEvent.click(screen.getByTitle('Exportar catálogo completo en JSON'));

    await waitFor(() => expect(screen.getByText('Export falló')).toBeInTheDocument());
  });
});
