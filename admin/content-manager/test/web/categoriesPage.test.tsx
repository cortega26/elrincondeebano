// @vitest-environment jsdom
// Plan 192: CategoriesPage coverage beyond undo — search, status filter,
// expand-all, and the reassign-on-delete flow (previously only covered by the
// sharded scope e2e, which npm test never runs). The reassign API contract
// itself is pinned in categoryMutationApi.test.ts (plan 096).

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { renderWithRouter, mockApi } from './harness.tsx';
import { CategoriesPage } from '@web/app/routes/CategoriesPage.tsx';

function categoryFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cat-a',
    key: 'frutas',
    slug: 'frutas',
    display_name: { default: 'Frutas' },
    nav_group: undefined,
    sort_order: 0,
    active: true,
    subcategories: [],
    ...overrides,
  };
}

const CATEGORIES_FIXTURE = {
  rev: 7,
  categories: [
    categoryFixture(),
    categoryFixture({
      id: 'cat-b',
      key: 'verduras',
      slug: 'verduras',
      display_name: { default: 'Verduras' },
      sort_order: 1,
    }),
    categoryFixture({
      id: 'cat-c',
      key: 'lacteos',
      slug: 'lacteos',
      display_name: { default: 'Lácteos' },
      sort_order: 2,
      active: false,
    }),
  ],
  nav_groups: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  mockApi.getCategories.mockResolvedValue(
    CATEGORIES_FIXTURE as unknown as Awaited<ReturnType<typeof mockApi.getCategories>>
  );
  mockApi.deleteCategory.mockResolvedValue({ status: 'deleted' } as unknown as ReturnType<
    typeof mockApi.deleteCategory
  >);
});

describe('CategoriesPage (component)', () => {
  test('search filters by name, key, and slug', async () => {
    const user = userEvent.setup();
    renderWithRouter(<CategoriesPage />);
    await waitFor(() => expect(screen.getByText('Categorías (3)')).toBeInTheDocument());

    await user.type(screen.getByLabelText('Buscar categoría'), 'verd');
    await waitFor(() => expect(screen.getByText('Categorías (1)')).toBeInTheDocument());
    expect(screen.getByText('Verduras')).toBeInTheDocument();
    expect(screen.queryByText('Frutas')).not.toBeInTheDocument();

    await user.clear(screen.getByLabelText('Buscar categoría'));
    await user.type(screen.getByLabelText('Buscar categoría'), 'lacteos');
    await waitFor(() => expect(screen.getByText('Categorías (1)')).toBeInTheDocument());
    expect(screen.getByText('Lácteos')).toBeInTheDocument();
  });

  test('status filter narrows to active or inactive only', async () => {
    const user = userEvent.setup();
    renderWithRouter(<CategoriesPage />);
    await waitFor(() => expect(screen.getByText('Categorías (3)')).toBeInTheDocument());

    await user.selectOptions(screen.getByLabelText('Filtrar por estado'), 'inactive');
    await waitFor(() => expect(screen.getByText('Categorías (1)')).toBeInTheDocument());
    expect(screen.getByText('Lácteos')).toBeInTheDocument();
    expect(screen.queryByText('Frutas')).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Filtrar por estado'), 'active');
    await waitFor(() => expect(screen.getByText('Categorías (2)')).toBeInTheDocument());
  });

  test('expand-all reveals subcategories', async () => {
    const user = userEvent.setup();
    mockApi.getCategories.mockResolvedValue({
      rev: 7,
      categories: [
        {
          ...categoryFixture(),
          subcategories: [{ id: 'sub-1', name: 'Cítricos' }],
        },
      ],
      nav_groups: [],
    } as unknown as Awaited<ReturnType<typeof mockApi.getCategories>>);

    renderWithRouter(<CategoriesPage />);
    await waitFor(() => expect(screen.getByText('Categorías (1)')).toBeInTheDocument());
    expect(screen.queryByText(/Subcategorías \(1\)/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Expandir todo' }));
    await waitFor(() => expect(screen.getByText(/Subcategorías \(1\)/)).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Colapsar todo' }));
    await waitFor(() => expect(screen.queryByText(/Subcategorías \(1\)/)).not.toBeInTheDocument());
  });

  test('delete offers reassignment and reports the target', async () => {
    const user = userEvent.setup();
    const promptSpy = vi.spyOn(window, 'prompt').mockImplementation(() => 'cat-b');

    renderWithRouter(<CategoriesPage />);
    await waitFor(() => expect(screen.getByText('Categorías (3)')).toBeInTheDocument());

    // First row is cat-a (fixture order).
    await user.click(screen.getAllByRole('button', { name: 'Eliminar' })[0]);

    await waitFor(() => {
      expect(mockApi.deleteCategory).toHaveBeenCalledWith('cat-a', 7, 'cat-b');
    });
    await waitFor(() =>
      expect(
        screen.getByText('Categoría eliminada, productos reasignados a cat-b ✓')
      ).toBeInTheDocument()
    );
    expect(promptSpy).toHaveBeenCalled();
    promptSpy.mockRestore();
  });

  test('delete without reassignment reports the plain message', async () => {
    const user = userEvent.setup();
    const promptSpy = vi.spyOn(window, 'prompt').mockImplementation(() => '');

    renderWithRouter(<CategoriesPage />);
    await waitFor(() => expect(screen.getByText('Categorías (3)')).toBeInTheDocument());

    await user.click(screen.getAllByRole('button', { name: 'Eliminar' })[0]);

    await waitFor(() => {
      expect(mockApi.deleteCategory).toHaveBeenCalledWith('cat-a', 7, undefined);
    });
    await waitFor(() => expect(screen.getByText('Categoría eliminada ✓')).toBeInTheDocument());
    promptSpy.mockRestore();
  });
});
