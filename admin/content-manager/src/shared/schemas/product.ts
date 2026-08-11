import { z } from 'zod';

export const fieldMetadataSchema = z.object({
  ts: z.string().optional(),
  by: z.string().optional(),
  rev: z.number().int().nonnegative().optional(),
  base_rev: z.number().int().nonnegative().optional(),
  changeset_id: z.string().nullable().optional(),
});

// Lenient per-product shape used on the READ path only (loadCatalog,
// validate()): a legacy catalog file that already has discount > price must
// still load so the repository's validate() can report it explicitly,
// rather than the parse hard-failing at read time. Write paths must use
// productSchema (below), which adds the cross-field invariant.
export const productReadSchema = z.object({
  name: z.string().min(1, 'El nombre del producto es obligatorio').max(200),
  description: z.string().max(1000).default(''),
  price: z.number().int().positive('El precio debe ser mayor que cero').max(1_000_000),
  discount: z.number().int().nonnegative().default(0),
  stock: z.boolean().default(false),
  category: z.string().max(50).default(''),
  image_path: z
    .string()
    .default('')
    // Plan 092: product media must live under assets/images/ with a known
    // extension — anything else breaks the storefront build or serves the
    // SPA fallback as an image.
    .refine(
      (v) => v === '' || /^assets\/images\/.+\.(?:webp|jpg|jpeg|png|avif|gif)$/i.test(v),
      'image_path debe estar bajo assets/images/ con extensión webp/jpg/png/avif/gif'
    ),
  image_avif_path: z
    .string()
    .default('')
    .refine(
      (v) => v === '' || /^assets\/images\/.+\.avif$/i.test(v),
      'image_avif_path debe ser .avif'
    ),
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

// Strict write schema: every create/edit/import write path must parse
// through this, never productReadSchema — see product.ts's Reviewer focus
// note in plan 074 for why the split must not silently drop this check.
export const productSchema = productReadSchema.superRefine((data, ctx) => {
  if (data.discount > data.price) {
    ctx.addIssue({
      code: 'custom',
      path: ['discount'],
      message: `Discount (${data.discount}) cannot exceed price (${data.price})`,
    });
  }
  if (data.category.trim().length === 0) {
    ctx.addIssue({
      code: 'custom',
      path: ['category'],
      message: 'La categoría es obligatoria',
    });
  }
});

export type Product = z.infer<typeof productSchema>;

export const productCatalogSchema = z.object({
  version: z.string(),
  last_updated: z.string(),
  rev: z.number().int().nonnegative().default(0),
  products: z.array(productReadSchema),
});

export type ProductCatalog = z.infer<typeof productCatalogSchema>;
