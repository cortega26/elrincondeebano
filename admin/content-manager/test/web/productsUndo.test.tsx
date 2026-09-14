// @vitest-environment jsdom
// Plan 174: undo entries come from the server apply response (not the
// rendered page), purged products don't block the rest, and an empty undo
// reports instead of hitting the batch non-empty guard.

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { renderWithRouter, mockApi, productA } from './harness.tsx';
import { ProductsPage } from '@web/app/routes/ProductsPage.tsx';

const PAGE_ITEMS = [
  { ...productA, id: 'p1', name: 'Prod 1', price: 100, discount: 0, stock: true, rev: 1 },
  { ...productA, id: 'p2', name: 'Prod 2', price: 200, discount: 0, stock: true, rev: 1 },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockApi.getProducts.mockResolvedValue({
    items: PAGE_ITEMS,
    total: PAGE_ITEMS.length,
    page: 1,
    pageSize: 50,
  });
  mockApi.getCategories.mockResolvedValue({ categories: [] } as unknown as Awaited<
    ReturnType<typeof mockApi.getCategories>
  >);
  mockApi.getSyncStatus.mockResolvedValue({
    sync: {
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
    },
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
  mockApi.getProduct.mockImplementation((id: string) =>
    Promise.resolve({ ...productA, id, rev: 7 })
  );
  mockApi.batchUpdateProducts.mockResolvedValue({
    status: 'ok',
    applied: 2,
  } as unknown as Awaited<ReturnType<typeof mockApi.batchUpdateProducts>>);
});

async function applyDiscountTen(user: ReturnType<typeof userEvent.setup>) {
  // Defaults are already set_discount_percent + value 10; the page-scope
  // confirm is accepted.
  await user.click(screen.getByRole('button', { name: 'Aplicar' }));
}

describe('ProductsPage undo from server snapshots (plan 174)', () => {
  test('undo restores server old values, not stale page values', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockImplementation(() => true);
    // The page shows discount 0, but the server truth at apply time was 50
    // (edited between list load and apply) — undo must restore 50.
    mockApi.bulkApply.mockResolvedValue({
      changed: 2,
      skipped: 0,
      changes: [
        { product_id: 'p1', name: 'Prod 1', field: 'discount', old_value: 50, new_value: 60 },
        { product_id: 'p2', name: 'Prod 2', field: 'discount', old_value: 50, new_value: 60 },
      ],
    });

    renderWithRouter(<ProductsPage />);
    await waitFor(() => expect(screen.getByText('Prod 1')).toBeInTheDocument());
    await applyDiscountTen(user);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Deshacer \(1\)/ })).toBeInTheDocument()
    );

    await user.click(screen.getByRole('button', { name: /Deshacer \(1\)/ }));
    await waitFor(() => expect(mockApi.batchUpdateProducts).toHaveBeenCalledTimes(1));
    const actions = mockApi.batchUpdateProducts.mock.calls[0][0] as Array<{
      id: string;
      patch: Record<string, unknown>;
    }>;
    expect(actions).toHaveLength(2);
    expect(actions.find((a) => a.id === 'p1')?.patch).toEqual({ discount: 50 });
    expect(actions.find((a) => a.id === 'p2')?.patch).toEqual({ discount: 50 });
  });

  test('one purged product does not block undoing the rest', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockImplementation(() => true);
    mockApi.bulkApply.mockResolvedValue({
      changed: 2,
      skipped: 0,
      changes: [
        { product_id: 'p1', name: 'Prod 1', field: 'discount', old_value: 0, new_value: 10 },
        { product_id: 'p2', name: 'Prod 2', field: 'discount', old_value: 0, new_value: 10 },
      ],
    });
    mockApi.getProduct.mockImplementation((id: string) =>
      id === 'p2'
        ? Promise.reject(new Error('Not found'))
        : Promise.resolve({ ...productA, id, rev: 7 })
    );

    renderWithRouter(<ProductsPage />);
    await waitFor(() => expect(screen.getByText('Prod 1')).toBeInTheDocument());
    await applyDiscountTen(user);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Deshacer \(1\)/ })).toBeInTheDocument()
    );

    await user.click(screen.getByRole('button', { name: /Deshacer \(1\)/ }));
    await waitFor(() => expect(mockApi.batchUpdateProducts).toHaveBeenCalledTimes(1));
    const actions = mockApi.batchUpdateProducts.mock.calls[0][0] as Array<{
      id: string;
      patch: Record<string, unknown>;
    }>;
    expect(actions).toHaveLength(1);
    expect(actions[0].id).toBe('p1');
  });

  test('all products purged reports cleanly without calling batch-update', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockImplementation(() => true);
    mockApi.bulkApply.mockResolvedValue({
      changed: 2,
      skipped: 0,
      changes: [
        { product_id: 'p1', name: 'Prod 1', field: 'discount', old_value: 0, new_value: 10 },
        { product_id: 'p2', name: 'Prod 2', field: 'discount', old_value: 0, new_value: 10 },
      ],
    });
    mockApi.getProduct.mockRejectedValue(new Error('Not found'));

    renderWithRouter(<ProductsPage />);
    await waitFor(() => expect(screen.getByText('Prod 1')).toBeInTheDocument());
    await applyDiscountTen(user);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Deshacer \(1\)/ })).toBeInTheDocument()
    );

    await user.click(screen.getByRole('button', { name: /Deshacer \(1\)/ }));
    await waitFor(() =>
      expect(screen.getByText('Nada que deshacer: los productos ya no existen')).toBeInTheDocument()
    );
    expect(mockApi.batchUpdateProducts).not.toHaveBeenCalled();
  });
});
