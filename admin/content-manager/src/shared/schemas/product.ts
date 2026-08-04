import { z } from 'zod';

export const fieldMetadataSchema = z.object({
  ts: z.string().optional(),
  by: z.string().optional(),
  rev: z.number().int().nonnegative().optional(),
  base_rev: z.number().int().nonnegative().optional(),
  changeset_id: z.string().nullable().optional(),
});

export const productSchema = z.object({
  name: z.string().min(1, 'El nombre del producto es obligatorio').max(200),
  description: z.string().max(1000).default(''),
  price: z.number().int().positive('El precio debe ser mayor que cero').max(1_000_000),
  discount: z.number().int().nonnegative().default(0),
  stock: z.boolean().default(false),
  category: z.string().max(50).default(''),
  image_path: z.string().default(''),
  image_avif_path: z.string().default(''),
  order: z.number().int().default(0),
  is_archived: z.boolean().default(false),
  rev: z.number().int().nonnegative().default(0),
  field_last_modified: z.record(z.string(), fieldMetadataSchema).default({}),

  // Forward-compatible fields (present in streamlit/astro models)
  id: z.string().optional(),
  sku: z.string().optional(),
  slug: z.string().optional(),
  brand: z.string().optional(),
  thumbnail_path: z.string().optional(),
  image_variants: z
    .array(
      z.object({
        src: z.string().optional(),
        url: z.string().optional(),
        width: z.number().int().positive().optional(),
      })
    )
    .optional(),
  thumbnail_variants: z
    .array(
      z.object({
        src: z.string().optional(),
        url: z.string().optional(),
        width: z.number().int().positive().optional(),
      })
    )
    .optional(),
});

export type Product = z.infer<typeof productSchema>;

export const productCatalogSchema = z.object({
  version: z.string(),
  last_updated: z.string(),
  rev: z.number().int().nonnegative().default(0),
  products: z.array(productSchema),
});

export type ProductCatalog = z.infer<typeof productCatalogSchema>;
