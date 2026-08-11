import { test, expect } from 'vitest';
import { CategoryService } from '../../src/domain/categories/categoryService.ts';
import type { CategoryRegistry } from '../../src/shared/schemas/category.ts';

function makeRegistry(rev = 1): CategoryRegistry {
  return {
    rev,
    nav_groups: [{ id: 'g1', sort_order: 0 }],
    categories: [
      {
        id: 'cat1',
        key: 'bebidas',
        slug: 'bebidas',
        display_name: { default: 'Bebidas' },
        nav_group: 'g1',
        sort_order: 0,
      },
    ],
  };
}

const service = new CategoryService();

// ── create ────────────────────────────────────────────────────────────────────

test('CategoryService.create adds a category with defaults', () => {
  const registry = makeRegistry();
  const result = service.create(registry, {
    id: 'cat2',
    key: 'snacks',
    slug: 'snacks',
    display_name: { default: 'Snacks' },
    nav_group: 'g1',
  });

  expect(result.ok).toBe(true);
  expect(result.category?.id).toBe('cat2');
  expect(result.category?.sort_order).toBe(1);
  expect(result.category?.active).toBe(true);
  expect(registry.categories).toHaveLength(2);
});

test('CategoryService.create rejects duplicate id, key, and slug', () => {
  const registry = makeRegistry();
  expect(service.create(registry, { id: 'cat1', key: 'x', slug: 'x' }).ok).toBe(false);
  expect(service.create(registry, { id: 'x', key: 'bebidas', slug: 'x' }).ok).toBe(false);
  expect(service.create(registry, { id: 'x', key: 'x', slug: 'bebidas' }).ok).toBe(false);
  expect(registry.categories).toHaveLength(1);
});

test('CategoryService.create rejects invalid input via schema', () => {
  const registry = makeRegistry();
  const result = service.create(registry, { id: 'cat2', key: '', slug: 'snacks' });
  expect(result.ok).toBe(false);
  expect(result.error).toBeTruthy();
  expect(registry.categories).toHaveLength(1);
});

// ── edit ──────────────────────────────────────────────────────────────────────

test('CategoryService.edit updates display_name and sort_order', () => {
  const registry = makeRegistry();
  const result = service.edit(registry, 'cat1', {
    display_name: { default: 'Bebidas y Aguas' },
    sort_order: 3,
  });

  expect(result.ok).toBe(true);
  expect(result.category?.display_name?.default).toBe('Bebidas y Aguas');
  expect(result.category?.sort_order).toBe(3);
  expect(registry.categories[0].sort_order).toBe(3);
});

test('CategoryService.edit reports not found', () => {
  const result = service.edit(makeRegistry(), 'nope', { sort_order: 1 });
  expect(result.ok).toBe(false);
  expect(result.error).toContain('not found');
});

test('CategoryService.edit rejects key and slug conflicts', () => {
  const registry = makeRegistry();
  service.create(registry, { id: 'cat2', key: 'snacks', slug: 'snacks' });

  expect(service.edit(registry, 'cat2', { key: 'bebidas' }).ok).toBe(false);
  expect(service.edit(registry, 'cat2', { slug: 'bebidas' }).ok).toBe(false);
  expect(service.edit(registry, 'cat2', { key: 'snacks' }).ok).toBe(true);
});

test('CategoryService.edit with empty key/slug is a no-op (KNOWN-BEHAVIOR)', () => {
  // The falsy guards (`changes.key &&`) mean falsy values are silently ignored
  // instead of clearing the field. Pinning current semantics — revisit with
  // plan 074/080-style invariant work.
  const registry = makeRegistry();
  const result = service.edit(registry, 'cat1', { key: '', slug: '' });
  expect(result.ok).toBe(true);
  expect(result.category?.key).toBe('bebidas');
  expect(result.category?.slug).toBe('bebidas');
});

// ── remove ────────────────────────────────────────────────────────────────────

test('CategoryService.remove blocks deletion when products use the category', () => {
  const result = service.remove(makeRegistry(), 'cat1', 2);
  expect(result.ok).toBe(false);
  expect(result.error).toContain('in use');
});

test('CategoryService.remove reports not found', () => {
  const result = service.remove(makeRegistry(), 'nope', 0);
  expect(result.ok).toBe(false);
  expect(result.error).toContain('not found');
});

test('CategoryService.remove deletes an unused category', () => {
  const registry = makeRegistry();
  const result = service.remove(registry, 'cat1', 0);
  expect(result.ok).toBe(true);
  expect(registry.categories).toHaveLength(0);
});

// ── reorder ───────────────────────────────────────────────────────────────────

test('CategoryService.reorder assigns sort_order by list position', () => {
  const registry = makeRegistry();
  service.create(registry, { id: 'cat2', key: 'snacks', slug: 'snacks' });

  const result = service.reorder(registry, ['cat2', 'cat1']);
  expect(result.ok).toBe(true);
  expect(registry.categories.find((c) => c.id === 'cat1')?.sort_order).toBe(1);
  expect(registry.categories.find((c) => c.id === 'cat2')?.sort_order).toBe(0);
});

test('CategoryService.reorder skips unknown ids but indexes the known ones', () => {
  const registry = makeRegistry();
  const result = service.reorder(registry, ['ghost', 'cat1']);
  expect(result.ok).toBe(true);
  // KNOWN-BEHAVIOR: known ids take their list index even with unknown ids in
  // the list (ghost at 0 is skipped, cat1 lands at 1).
  expect(registry.categories.find((c) => c.id === 'cat1')?.sort_order).toBe(1);
});

// ── nav groups ────────────────────────────────────────────────────────────────

test('CategoryService.addNavGroup adds a group with defaults', () => {
  const registry = makeRegistry();
  const result = service.addNavGroup(registry, { id: 'g2' });
  expect(result.ok).toBe(true);
  expect(result.group?.sort_order).toBe(1);
  expect(result.group?.active).toBe(true);
});

test('CategoryService.addNavGroup rejects duplicate id', () => {
  const result = service.addNavGroup(makeRegistry(), { id: 'g1' });
  expect(result.ok).toBe(false);
  expect(result.error).toContain('already exists');
});

test('CategoryService.removeNavGroup blocks when categories reference the group', () => {
  const result = service.removeNavGroup(makeRegistry(), 'g1');
  expect(result.ok).toBe(false);
  expect(result.error).toContain('Reassign');
});

test('CategoryService.removeNavGroup reports not found and deletes unused groups', () => {
  const registry = makeRegistry();
  expect(service.removeNavGroup(registry, 'ghost').ok).toBe(false);

  service.addNavGroup(registry, { id: 'g2' });
  expect(service.removeNavGroup(registry, 'g2').ok).toBe(true);
  expect(registry.nav_groups).toHaveLength(1);
});
