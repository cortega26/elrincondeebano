import { z } from 'zod';

export const subcategorySchema = z.object({
  id: z.string().min(1),
  title: z.string().default(''),
  product_key: z.string().default(''),
  slug: z.string().default(''),
  description: z.string().default(''),
  order: z.number().int().default(0),
  enabled: z.boolean().default(true),
});

export type Subcategory = z.infer<typeof subcategorySchema>;

export const categoryRecordSchema = z.object({
  id: z.string().min(1),
  key: z
    .string()
    .min(1)
    // Plan 100: keys become filesystem path segments (assets/images/<key>/)
    // and URL segments — forbid path separators and traversal.
    .regex(
      /^[A-Za-z0-9À-ÿ ._'&()-]+$/,
      "La clave de categoría solo puede contener letras, números, espacios, y ._'-&()"
    ),
  slug: z
    .string()
    // Plan 100: slugs become OG-image file names
    // (assets/images/og/categories/<slug>.og_v3.jpg).
    .regex(
      /^[A-Za-z0-9._-]*$/,
      'El slug solo puede contener letras, números, puntos, guiones y guiones bajos'
    ),
  display_name: z.object({ default: z.string().optional() }).optional(),
  nav_group: z.string().optional(),
  active: z.boolean().optional(),
  sort_order: z.number().int().optional(),
  description: z.string().optional(),
  subcategories: z.array(subcategorySchema).optional(),
});

export type CategoryRecord = z.infer<typeof categoryRecordSchema>;

export const navGroupRecordSchema = z.object({
  id: z.string().min(1),
  display_name: z.object({ default: z.string().optional() }).optional(),
  active: z.boolean().optional(),
  sort_order: z.number().int().optional(),
});

export type NavGroupRecord = z.infer<typeof navGroupRecordSchema>;

export const categoryRegistrySchema = z.object({
  rev: z.number().int().nonnegative().default(0),
  nav_groups: z.array(navGroupRecordSchema).default([]),
  categories: z.array(categoryRecordSchema).default([]),
});

export type CategoryRegistry = z.infer<typeof categoryRegistrySchema>;

export const legacyCategorySchema = z.object({
  version: z.string().optional(),
  last_updated: z.string().optional(),
  nav_groups: z
    .array(
      z.object({
        id: z.string(),
        label: z.string().optional(),
        description: z.string().optional(),
        order: z.number().int().optional(),
        enabled: z.boolean().optional(),
      })
    )
    .optional(),
  categories: z
    .array(
      z.object({
        id: z.string(),
        title: z.string().optional(),
        product_key: z.string().optional(),
        slug: z.string().optional(),
        description: z.string().optional(),
        group_id: z.string().optional(),
        order: z.number().int().optional(),
        enabled: z.boolean().optional(),
        subcategories: z.array(subcategorySchema).optional(),
      })
    )
    .optional(),
});

export type LegacyCategoryCatalog = z.infer<typeof legacyCategorySchema>;
