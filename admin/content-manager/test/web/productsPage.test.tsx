// @vitest-environment jsdom
// Plan 127 F1.1: component smoke tests for ProductsPage — the UI layer that
// previously only had e2e coverage (bugs 099/101/126 lived here).

import { screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { renderWithRouter, flushPromises, mockApi, productA } from './harness.tsx';
import { ProductsPage } from '@web/app/routes/ProductsPage.tsx';
import { ApiRequestError } from '@web/api/client.ts';

beforeEach(() => {
  vi.clearAllMocks();
  mockApi.getProducts.mockResolvedValue({
    items: [productA],
    total: 1,
    page: 1,
    pageSize: 50,
  });
  mockApi.getCategories.mockResolvedValue({ categories: [] });
  mockApi.getGitStatus.mockResolvedValue({});
  mockApi.gitPull.mockResolvedValue({ job_id: 'j', status: 'ok' });
  mockApi.getProduct.mockResolvedValue(productA);
  mockApi.updateProduct.mockResolvedValue({ product: productA } as unknown as ReturnType<typeof mockApi.updateProduct>);
  mockApi.deleteProduct.mockResolvedValue({ status: 'deleted' } as unknown as ReturnType<typeof mockApi.deleteProduct>);
});

describe('ProductsPage (component)', () => {
  test('renders the filter bar and the product after load', async () => {
    renderWithRouter(<ProductsPage />);

    // Filter bar (plan 101 gates reorder on these).
    expect(screen.getByLabelText('Categoría:')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Solo descuento' })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Producto A')).toBeInTheDocument();
    });
  });

  test('reorder is disabled while a discount filter is active (plan 101)', async () => {
    const user = userEvent.setup();
    renderWithRouter(<ProductsPage />);
    await waitFor(() => {
      expect(screen.getByText('Producto A')).toBeInTheDocument();
    });

    const reorders = screen.getAllByRole('button', { name: '⇅ Reordenar' });
    expect(reorders.length).toBeGreaterThan(0);
    // No filters + full catalog on one page -> reorder is ENABLED.
    expect(reorders[0]).toBeEnabled();

    await user.click(screen.getByRole('checkbox', { name: 'Solo descuento' }));
    // With the discount filter on, reorder is disabled — the server
    // requires the FULL catalog (409 REORDER_SCOPE_AMBIGUOUS otherwise).
    expect(screen.getAllByRole('button', { name: '⇅ Reordenar' })[0]).toBeDisabled();
  });

  test('destructive bulk apply fires a confirm dialog (plan 126 contract)', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockImplementation(() => true);

    renderWithRouter(<ProductsPage />);
    await flushPromises();
    await waitFor(() => {
      expect(screen.getByText('Producto A')).toBeInTheDocument();
    });

    // Page-scope bulk apply asks the operator first.
    await user.selectOptions(screen.getByLabelText('Acción masiva'), 'set_stock');
    await user.selectOptions(screen.getByLabelText('Valor de stock'), 'true');
    await user.click(screen.getByRole('button', { name: 'Aplicar' }));

    expect(confirmSpy).toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  test('dismissing the bulk confirm cancels the apply (plan 126 dismiss path)', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockImplementation(() => false);

    renderWithRouter(<ProductsPage />);
    await waitFor(() => {
      expect(screen.getByText('Producto A')).toBeInTheDocument();
    });

    await user.selectOptions(screen.getByLabelText('Acción masiva'), 'set_stock');
    await user.selectOptions(screen.getByLabelText('Valor de stock'), 'true');
    await user.click(screen.getByRole('button', { name: 'Aplicar' }));

    expect(confirmSpy).toHaveBeenCalled();
    // Dismissed -> no apply feedback.
    expect(screen.queryByText(/Aplicado:/)).not.toBeInTheDocument();
    confirmSpy.mockRestore();
  });

  test('reorder appends archived ids so the payload covers the full catalog (plan 128)', async () => {
    const user = userEvent.setup();
    const visible = [1, 2, 3, 4].map((n) => ({
      ...productA,
      id: `v${n}`,
      name: `Visible ${n}`,
      order: n - 1,
    }));
    const archived = [5, 6].map((n) => ({
      ...productA,
      id: `a${n}`,
      name: `Archivado ${n}`,
      order: n - 1,
      is_archived: true,
    }));
    mockApi.getProducts.mockImplementation((params?: { archived?: boolean }) => {
      if (params?.archived === true) {
        return Promise.resolve({ items: archived, total: archived.length, page: 1, pageSize: 50 });
      }
      return Promise.resolve({ items: visible, total: visible.length, page: 1, pageSize: 50 });
    });
    mockApi.reorderProducts.mockClear();

    renderWithRouter(<ProductsPage />);
    await waitFor(() => {
      expect(screen.getByText('Visible 1')).toBeInTheDocument();
    });

    await user.click(screen.getAllByRole('button', { name: '⇅ Reordenar' })[0]);

    await waitFor(() => {
      expect(mockApi.reorderProducts).toHaveBeenCalledWith(['v1', 'v2', 'v3', 'v4', 'a5', 'a6']);
    });
  });

  test('reorder sends only the visible ids when no archived products exist (plan 128)', async () => {
    const user = userEvent.setup();
    const visible = [1, 2, 3, 4].map((n) => ({
      ...productA,
      id: `v${n}`,
      name: `Visible ${n}`,
      order: n - 1,
    }));
    mockApi.getProducts.mockImplementation((params?: { archived?: boolean }) => {
      if (params?.archived === true) {
        return Promise.resolve({ items: [], total: 0, page: 1, pageSize: 50 });
      }
      return Promise.resolve({ items: visible, total: visible.length, page: 1, pageSize: 50 });
    });
    mockApi.reorderProducts.mockClear();

    renderWithRouter(<ProductsPage />);
    await waitFor(() => {
      expect(screen.getByText('Visible 1')).toBeInTheDocument();
    });

    await user.click(screen.getAllByRole('button', { name: '⇅ Reordenar' })[0]);

    await waitFor(() => {
      expect(mockApi.reorderProducts).toHaveBeenCalledWith(['v1', 'v2', 'v3', 'v4']);
    });
  });

  test('drag-and-drop reorder appends archived ids to the reordered visible ids (plan 128)', async () => {
    const visible = [1, 2, 3, 4].map((n) => ({
      ...productA,
      id: `v${n}`,
      name: `Visible ${n}`,
      order: n - 1,
    }));
    const archived = [5, 6].map((n) => ({
      ...productA,
      id: `a${n}`,
      name: `Archivado ${n}`,
      order: n - 1,
      is_archived: true,
    }));
    mockApi.getProducts.mockImplementation((params?: { archived?: boolean }) => {
      if (params?.archived === true) {
        return Promise.resolve({ items: archived, total: archived.length, page: 1, pageSize: 50 });
      }
      return Promise.resolve({ items: visible, total: visible.length, page: 1, pageSize: 50 });
    });
    mockApi.reorderProducts.mockClear();

    renderWithRouter(<ProductsPage />);
    await waitFor(() => {
      expect(screen.getByText('Visible 1')).toBeInTheDocument();
    });

    const rows = screen.getAllByRole('row');
    // rows[0] is the table header row; visible products are rows[1..4].
    const dataTransfer = { setData: () => {}, dropEffect: '' };
    fireEvent.dragStart(rows[1], { dataTransfer });
    fireEvent.dragOver(rows[3], { dataTransfer });
    fireEvent.drop(rows[3], { dataTransfer });

    // Dragging v1 onto row index 2 reorders the visible items to
    // [v2, v3, v1, v4]; the archived ids are appended after them.
    await waitFor(() => {
      expect(mockApi.reorderProducts).toHaveBeenCalledWith(['v2', 'v3', 'v1', 'v4', 'a5', 'a6']);
    });
  });

  test('withFreshRev retries archive on 409 with fresh rev (plan 141)', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockImplementation(() => true);
    // stale rev 1, fresh rev 5
    const freshProduct = { ...productA, rev: 5 };
    mockApi.updateProduct
      .mockRejectedValueOnce(new ApiRequestError('Conflict', 409))
      .mockResolvedValueOnce({ product: freshProduct } as unknown as ReturnType<typeof mockApi.updateProduct>);
    mockApi.getProduct.mockResolvedValueOnce(freshProduct);
    // reload after retry will call getProducts again
    mockApi.getProducts.mockResolvedValue({ items: [productA], total: 1, page: 1, pageSize: 50 });

    renderWithRouter(<ProductsPage />);
    await waitFor(() => expect(screen.getByText('Producto A')).toBeInTheDocument());

    await user.click(screen.getByLabelText('Archivar Producto A'));

    await waitFor(() => {
      expect(mockApi.updateProduct).toHaveBeenCalledTimes(2);
      expect(mockApi.updateProduct).toHaveBeenNthCalledWith(1, 'p1', 1, { is_archived: true });
      expect(mockApi.updateProduct).toHaveBeenNthCalledWith(2, 'p1', 5, { is_archived: true });
    });
    expect(mockApi.getProduct).toHaveBeenCalledWith('p1');
    // success feedback after retry
    await waitFor(() => expect(screen.getByText('Producto archivado ✓')).toBeInTheDocument());
    confirmSpy.mockRestore();
  });

  test('withFreshRev shows reload message when 409 refetch fails (plan 141)', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockImplementation(() => true);
    mockApi.updateProduct.mockRejectedValueOnce(new ApiRequestError('Conflict', 409));
    mockApi.getProduct.mockRejectedValueOnce(new Error('gone'));

    renderWithRouter(<ProductsPage />);
    await waitFor(() => expect(screen.getByText('Producto A')).toBeInTheDocument());

    await user.click(screen.getByLabelText('Archivar Producto A'));

    await waitFor(() => expect(screen.getByText('El producto cambió; la lista se recargó.')).toBeInTheDocument());
    expect(mockApi.getProduct).toHaveBeenCalledWith('p1');
    // no retry after refetch failure
    expect(mockApi.updateProduct).toHaveBeenCalledTimes(1);
    confirmSpy.mockRestore();
  });

  test('withFreshRev does not retry on non-409 error (plan 141)', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockImplementation(() => true);
    mockApi.updateProduct.mockRejectedValueOnce(new ApiRequestError('Server error', 500));

    renderWithRouter(<ProductsPage />);
    await waitFor(() => expect(screen.getByText('Producto A')).toBeInTheDocument());

    await user.click(screen.getByLabelText('Archivar Producto A'));

    await waitFor(() => expect(mockApi.updateProduct).toHaveBeenCalledTimes(1));
    expect(mockApi.getProduct).not.toHaveBeenCalled();
    // error surfaces via opError (500 message), not the 409 reload message
    expect(screen.queryByText('El producto cambió; la lista se recargó.')).not.toBeInTheDocument();
    confirmSpy.mockRestore();
  });
});
