import type {
  CategoryRegistry,
  CategoryRecord,
  NavGroupRecord,
} from '../../shared/schemas/category.ts';
import { categoryRecordSchema, navGroupRecordSchema } from '../../shared/schemas/category.ts';

export interface CreateCategoryInput {
  id: string;
  key: string;
  slug: string;
  display_name?: { default?: string };
  nav_group?: string;
  description?: string;
  sort_order?: number;
  active?: boolean;
}

export interface CreateNavGroupInput {
  id: string;
  display_name?: { default?: string };
  sort_order?: number;
  active?: boolean;
}

export class CategoryService {
  create(
    registry: CategoryRegistry,
    input: CreateCategoryInput
  ): { ok: boolean; error?: string; category?: CategoryRecord } {
    const categories = registry.categories ?? [];

    if (categories.some((c) => c.id === input.id)) {
      return { ok: false, error: `Category "${input.id}" already exists` };
    }
    if (categories.some((c) => c.key === input.key)) {
      return { ok: false, error: `Category key "${input.key}" already exists` };
    }
    if (categories.some((c) => c.slug === input.slug)) {
      return { ok: false, error: `Category slug "${input.slug}" already exists` };
    }

    const category: CategoryRecord = {
      id: input.id,
      key: input.key,
      slug: input.slug,
      display_name: input.display_name,
      nav_group: input.nav_group,
      description: input.description,
      sort_order: input.sort_order ?? categories.length,
      active: input.active ?? true,
    };

    const result = categoryRecordSchema.safeParse(category);
    if (!result.success) {
      return { ok: false, error: result.error.issues.map((i) => i.message).join('; ') };
    }

    registry.categories = [...categories, result.data];
    return { ok: true, category: result.data };
  }

  edit(
    registry: CategoryRegistry,
    id: string,
    changes: Partial<CreateCategoryInput>
  ): { ok: boolean; error?: string; category?: CategoryRecord } {
    const categories = registry.categories ?? [];
    const idx = categories.findIndex((c) => c.id === id);
    if (idx === -1) {
      return { ok: false, error: `Category "${id}" not found` };
    }

    const existing = categories[idx];

    if (
      changes.key &&
      changes.key !== existing.key &&
      categories.some((c) => c.key === changes.key)
    ) {
      return { ok: false, error: `Category key "${changes.key}" already in use` };
    }
    if (
      changes.slug &&
      changes.slug !== existing.slug &&
      categories.some((c) => c.slug === changes.slug)
    ) {
      return { ok: false, error: `Category slug "${changes.slug}" already in use` };
    }

    const updated: CategoryRecord = {
      ...existing,
      ...(changes.key && { key: changes.key }),
      ...(changes.slug && { slug: changes.slug }),
      ...(changes.display_name !== undefined && { display_name: changes.display_name }),
      ...(changes.nav_group !== undefined && { nav_group: changes.nav_group }),
      ...(changes.description !== undefined && { description: changes.description }),
      ...(changes.sort_order !== undefined && { sort_order: changes.sort_order }),
      ...(changes.active !== undefined && { active: changes.active }),
    };

    const result = categoryRecordSchema.safeParse(updated);
    if (!result.success) {
      return { ok: false, error: result.error.issues.map((i) => i.message).join('; ') };
    }

    registry.categories = registry.categories!.map((c) => (c.id === id ? result.data : c));
    return { ok: true, category: result.data };
  }

  remove(
    registry: CategoryRegistry,
    id: string,
    productsUsingCategory: number
  ): { ok: boolean; error?: string } {
    if (productsUsingCategory > 0) {
      return {
        ok: false,
        error: `Category is in use by ${productsUsingCategory} products. Reassign them first.`,
      };
    }

    const categories = registry.categories ?? [];
    const idx = categories.findIndex((c) => c.id === id);
    if (idx === -1) {
      return { ok: false, error: `Category "${id}" not found` };
    }

    registry.categories = categories.filter((c) => c.id !== id);
    return { ok: true };
  }

  reorder(registry: CategoryRegistry, orderedIds: string[]): { ok: boolean; error?: string } {
    const categories = registry.categories ?? [];
    for (let i = 0; i < orderedIds.length; i++) {
      const cat = categories.find((c) => c.id === orderedIds[i]);
      if (cat) {
        cat.sort_order = i;
      }
    }
    return { ok: true };
  }

  addNavGroup(
    registry: CategoryRegistry,
    input: CreateNavGroupInput
  ): { ok: boolean; error?: string; group?: NavGroupRecord } {
    const groups = registry.nav_groups ?? [];
    if (groups.some((g) => g.id === input.id)) {
      return { ok: false, error: `Nav group "${input.id}" already exists` };
    }

    const group: NavGroupRecord = {
      id: input.id,
      display_name: input.display_name,
      sort_order: input.sort_order ?? groups.length,
      active: input.active ?? true,
    };

    const result = navGroupRecordSchema.safeParse(group);
    if (!result.success) {
      return { ok: false, error: result.error.issues.map((i) => i.message).join('; ') };
    }

    registry.nav_groups = [...groups, result.data];
    return { ok: true, group: result.data };
  }

  removeNavGroup(registry: CategoryRegistry, id: string): { ok: boolean; error?: string } {
    const groups = registry.nav_groups ?? [];
    if (!groups.some((g) => g.id === id)) {
      return { ok: false, error: `Nav group "${id}" not found` };
    }

    const categoriesInGroup = (registry.categories ?? []).filter((c) => c.nav_group === id);
    if (categoriesInGroup.length > 0) {
      return {
        ok: false,
        error: `Nav group has ${categoriesInGroup.length} categories. Reassign them first.`,
      };
    }

    registry.nav_groups = groups.filter((g) => g.id !== id);
    return { ok: true };
  }
}
