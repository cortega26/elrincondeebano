// Schemas Zod puros — usables desde Node.js (scripts) y desde Astro (content.config.ts).
// No importa módulos de Astro para mantener compatibilidad con scripts de build.

import { z } from 'zod';

export const productImageVariantSchema = z.object({
  src: z.string().optional(),
  url: z.string().optional(),
  width: z.number().int().positive().optional(),
});

export const productSchema = z.object({
  name: z.string().min(1, 'El nombre del producto es obligatorio'),
  description: z.string().optional(),
  price: z.number().nonnegative().optional(),
  discount: z.number().nonnegative().optional(),
  stock: z.boolean().optional(),
  category: z.string().min(1, 'La categoría es obligatoria'),
  image_path: z.string().optional(),
  image_avif_path: z.string().optional(),
  image_variants: z.array(productImageVariantSchema).optional(),
  thumbnail_path: z.string().optional(),
  thumbnail_variants: z.array(productImageVariantSchema).optional(),
  order: z.number().int().optional(),
  is_archived: z.boolean().optional(),
});

export const productCatalogSchema = z.object({
  version: z.string().optional(),
  last_updated: z.string().optional(),
  rev: z.number().int().nonnegative().optional(),
  products: z.array(productSchema),
});

export const categoryRecordSchema = z.object({
  id: z.string(),
  key: z.string().min(1),
  slug: z.string(),
  display_name: z.object({ default: z.string().optional() }).optional(),
  nav_group: z.string().optional(),
  active: z.boolean().optional(),
  sort_order: z.number().int().optional(),
  description: z.string().optional(),
});

export const navGroupRecordSchema = z.object({
  id: z.string(),
  display_name: z.object({ default: z.string().optional() }).optional(),
  active: z.boolean().optional(),
  sort_order: z.number().int().optional(),
});

export const categoryRegistrySchema = z.object({
  nav_groups: z.array(navGroupRecordSchema),
  categories: z.array(categoryRecordSchema),
});

export const storefrontTrustItemSchema = z.object({
  label: z.string(),
  value: z.string(),
});

export const productReferenceSchema = z.object({
  category: z.string(),
  name: z.string(),
});

export const storefrontBundleSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  items: z.array(productReferenceSchema),
  bundlePrice: z.number().nonnegative().optional(),
});

export const storefrontCompanionRuleSchema = z.object({
  sourceCategories: z.array(z.string()),
  targets: z.array(productReferenceSchema),
});

export const storefrontExperienceSchema = z.object({
  trustBar: z.object({
    highlights: z.array(storefrontTrustItemSchema),
    statusItems: z.array(storefrontTrustItemSchema),
  }),
  home: z.object({
    primaryCategories: z.array(z.string()),
    secondaryCategories: z.array(z.string()),
    fallbackQuickPicks: z.array(productReferenceSchema),
    featuredStaples: z.array(productReferenceSchema),
  }),
  bundles: z.array(storefrontBundleSchema),
  companionRules: z.array(storefrontCompanionRuleSchema),
});

export type ProductRecord = z.infer<typeof productSchema>;
export type ProductCatalog = z.infer<typeof productCatalogSchema>;
export type CategoryRecord = z.infer<typeof categoryRecordSchema>;
export type CategoryRegistry = z.infer<typeof categoryRegistrySchema>;
export type StorefrontExperience = z.infer<typeof storefrontExperienceSchema>;
export type StorefrontBundleRecord = z.infer<typeof storefrontBundleSchema>;
export type StorefrontTrustItem = z.infer<typeof storefrontTrustItemSchema>;
