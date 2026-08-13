// @vitest-environment jsdom
// Plan 127 F2.1: category undo/redo at the component level — create a
// category, undo it (delete op through the batch endpoint), redo it.

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { describe, test, expect, beforeEach } from 'vitest';
import { renderWithRouter, mockApi } from './harness.tsx';
import { CategoriesPage } from '@web/app/routes/CategoriesPage.tsx';

beforeEach(() => {
  mockApi.getCategories.mockResolvedValue({
    rev: 5,
    nav_groups: [],
    categories: [
      {
        id: 'cat-a',
        key: 'cata',
        slug: 'cat-a',
        display_name: { default: 'Cat A' },
        active: true,
        sort_order: 0,
      },
    ],
  });
  mockApi.createCategory.mockResolvedValue({});
  mockApi.deleteCategory.mockResolvedValue({});
  mockApi.updateCategory.mockResolvedValue({});
  mockApi.batchUpdateCategories.mockResolvedValue({ command_id: 'x', status: 'ok', applied: 1 });
  mockApi.createNavGroup.mockResolvedValue({});
  mockApi.updateNavGroup.mockResolvedValue({});
  mockApi.deleteNavGroup.mockResolvedValue({});
  mockApi.createSubcategory.mockResolvedValue({});
  mockApi.updateSubcategory.mockResolvedValue({});
  mockApi.deleteSubcategory.mockResolvedValue({});
});

describe('CategoriesPage undo/redo (plan 127 F2.1)', () => {
  test('creating a category enables undo; undo sends a delete op', async () => {
    const user = userEvent.setup();
    renderWithRouter(<CategoriesPage />);
    await waitFor(() => {
      expect(screen.getByText('Cat A')).toBeInTheDocument();
    });

    const undoBtn = screen.getByRole('button', { name: '↩ Deshacer categoría' });
    expect(undoBtn).toBeDisabled();

    // Open the create form and submit a new category.
    const categoriesSection = screen.getByRole('region', { name: 'Categorías' });
    await user.click(within(categoriesSection).getByRole('button', { name: '+ Añadir' }));
    await user.type(within(categoriesSection).getByLabelText('id:'), 'cat-b');
    await user.type(within(categoriesSection).getByLabelText('key:'), 'catb');
    await user.type(within(categoriesSection).getByLabelText('slug:'), 'cat-b');
    await user.type(within(categoriesSection).getByLabelText('display_name:'), 'Cat B');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(mockApi.createCategory).toHaveBeenCalled();
    expect(undoBtn).toBeEnabled();

    await user.click(undoBtn);
    await waitFor(() => {
      expect(mockApi.batchUpdateCategories).toHaveBeenCalled();
    });
    const [ops] = mockApi.batchUpdateCategories.mock.calls[0];
    expect(ops).toEqual([{ type: 'delete', category: { id: 'cat-b' } }]);
  });
});
