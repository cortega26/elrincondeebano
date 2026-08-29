// Schemas Zod puros — usables desde Node.js (scripts) y desde Astro (content.config.ts).
// No importa módulos de Astro para mantener compatibilidad con scripts de build.
// Plan 154: canonical product/category/storefront validation lives in
// admin/content-manager/src/shared/schemas/* (leaf zod schemas only — no server
// code leaks into the browser bundle). This file re-exports those canonical
// schemas for build-time validation (src/data/*.json, Astro content collections).
// Where the storefront legitimately needs looser shapes for projection
// (e.g. price optional), the divergence is explicit and commented — not silent.

import { z } from 'zod';

// Canonical leaf schemas (plan 154) — single source of truth
import {
  productSchema as canonicalProductSchema,
  productReadSchema as canonicalProductReadSchema,
  productCatalogSchema as canonicalProductCatalogSchema,
  fieldMetadataSchema as canonicalFieldMetadataSchema,
} from '../../../admin/content-manager/src/shared/schemas/product.ts';
import {
  categoryRecordSchema as canonicalCategoryRecordSchema,
  navGroupRecordSchema as canonicalNavGroupRecordSchema,
  categoryRegistrySchema as canonicalCategoryRegistrySchema,
} from '../../../admin/content-manager/src/shared/schemas/category.ts';
import {
  storefrontBundleSchema as canonicalStorefrontBundleSchema,
  storefrontCompanionRuleSchema as canonicalStorefrontCompanionRuleSchema,
  storefrontExperienceSchema as canonicalStorefrontExperienceSchema,
  productReferenceSchema as canonicalProductReferenceSchema,
  storefrontTrustItemSchema as canonicalStorefrontTrustItemSchema,
} from '../../../admin/content-manager/src/shared/schemas/storefront.ts';

// Product image variant — identical to canonical image_variants shape
export const productImageVariantSchema = z.object({
  src: z.string().optional(),
  url: z.string().optional(),
  width: z.number().int().positive().optional(),
});

// Strict canonical schemas — used for build validation (npm run data:validate,
// Astro content collections, sync-data). These enforce the same rules as the
// admin API (price int positive max1M, image_path under assets/images, AVIF
// companion for raster, category regex, etc.).
export const productSchema = canonicalProductSchema;
export const productReadSchema = canonicalProductReadSchema;
export const productCatalogSchema = canonicalProductCatalogSchema;
export const fieldMetadataSchema = canonicalFieldMetadataSchema;

export const categoryRecordSchema = canonicalCategoryRecordSchema;
export const navGroupRecordSchema = canonicalNavGroupRecordSchema;
export const categoryRegistrySchema = canonicalCategoryRegistrySchema;

export const storefrontTrustItemSchema = canonicalStorefrontTrustItemSchema;
export const productReferenceSchema = canonicalProductReferenceSchema;
export const storefrontBundleSchema = canonicalStorefrontBundleSchema;
export const storefrontCompanionRuleSchema = canonicalStorefrontCompanionRuleSchema;
export const storefrontExperienceSchema = canonicalStorefrontExperienceSchema;

// ---------------------------------------------------------------------------
// Storefront projection divergence (explicit, commented)
// ---------------------------------------------------------------------------
// The storefront projection (catalog.ts, client bundles) intentionally allows
// looser product shapes for backwards-compatible reads: price/discount/stock
// may be missing, category validation is relaxed to min1 (without the
// canonical regex/max50), image paths are optional any-string, and
// field_last_modified is omitted. These relaxations are confined to this
// derived schema and never used for build-time validation — the strict
// `productSchema` / `productCatalogSchema` above remain the gates.
//
// Each divergence is listed here, not hidden in a silent re-implementation:
// - price: canonical requires int positive max1_000_000; projection allows
//   optional nonnegative (including 0/float/missing) for legacy projections
// - discount: canonical int nonnegative default 0; projection optional
// - stock: canonical boolean default false; projection optional boolean
// - category: canonical regex /^[A-Za-z0-9À-ÿ ._'&()-]*$/ max50 + trimmed
//   non-empty via superRefine; projection only min1 (no regex/max)
// - description: canonical max1000 default ''; projection optional any string
// - image_path: canonical must be '' or assets/images/... with ext
//   webp/jpg/png/avif/gif; projection optional any string
// - image_avif_path: canonical must be '' or assets/images/... .avif;
//   projection optional any string
// - order, is_archived, rev: canonical with defaults; projection optional
// - field_last_modified: canonical strict record; projection omitted/any
// - brand, image_variants, thumbnail_path, etc.: forwarded as optional
export const productProjectionSchema = z
  .object({
    name: z.string().min(1, 'El nombre del producto es obligatorio'),
    description: z.string().optional(),
    price: z.number().nonnegative().optional(),
    discount: z.number().nonnegative().optional(),
    stock: z.boolean().optional(),
    category: z.string().min(1, 'La categoría es obligatoria').optional(),
    brand: z.string().optional(),
    image_path: z.string().optional(),
    image_avif_path: z.string().optional(),
    image_variants: z.array(productImageVariantSchema).optional(),
    thumbnail_path: z.string().optional(),
    thumbnail_variants: z.array(productImageVariantSchema).optional(),
    order: z.number().int().optional(),
    is_archived: z.boolean().optional(),
    rev: z.number().int().nonnegative().optional(),
    field_last_modified: z.record(z.string(), z.any()).optional(),
    id: z.string().optional(),
    sku: z.string().optional(),
    slug: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (
      typeof data.discount === 'number' &&
      typeof data.price === 'number' &&
      data.discount > data.price
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['discount'],
        message: `Discount (${data.discount}) cannot exceed price (${data.price})`,
      });
    }
    // Note: AVIF companion and category regex are intentionally not enforced
    // on projection (divergence documented above); strict validation uses
    // `productSchema` (canonical) instead.
  });

export const productCatalogProjectionSchema = z.object({
  version: z.string().optional(),
  last_updated: z.string().optional(),
  rev: z.number().int().nonnegative().optional(),
  products: z.array(productProjectionSchema),
});

export type ProductRecord = z.infer<typeof productSchema>;
export type ProductCatalog = z.infer<typeof productCatalogSchema>;
// Raw JSON may lack `rev` and subcategory optional fields (filled via defaults
// on parse) — use input types so `rawCategories as CategoryRegistry` in
// catalog.ts stays compatible without extra casts. Validated shapes have
// required fields after `safeParse`.
export type CategoryRecord = z.input<typeof categoryRecordSchema>;
export type NavGroupRecord = z.input<typeof navGroupRecordSchema>;
export type CategoryRegistry = z.input<typeof categoryRegistrySchema>;
export type StorefrontExperience = z.infer<typeof storefrontExperienceSchema>;
export type StorefrontBundleRecord = z.infer<typeof storefrontBundleSchema>;
export type StorefrontTrustItem = z.infer<typeof storefrontTrustItemSchema>;
export type ProductProjection = z.infer<typeof productProjectionSchema>;
export type ProductCatalogProjection = z.infer<typeof productCatalogProjectionSchema>;
