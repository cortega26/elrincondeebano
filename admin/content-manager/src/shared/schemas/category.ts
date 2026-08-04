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
  key: z.string().min(1),
  slug: z.string(),
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
