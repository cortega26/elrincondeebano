// @vitest-environment jsdom
// Plan 127 F1.1: component smoke tests for ProductsPage — the UI layer that
// previously only had e2e coverage (bugs 099/101/126 lived here).

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { renderWithRouter, flushPromises, mockApi, productA } from './harness.tsx';
import { ProductsPage } from '@web/app/routes/ProductsPage.tsx';

beforeEach(() => {
  mockApi.getProducts.mockResolvedValue({
    items: [productA],
    total: 1,
    page: 1,
    pageSize: 50,
  });
  mockApi.getCategories.mockResolvedValue({ categories: [] });
  mockApi.getGitStatus.mockResolvedValue({});
  mockApi.gitPull.mockResolvedValue({ job_id: 'j', status: 'ok' });
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
});
