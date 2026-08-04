import { z } from 'zod';

export const apiErrorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    correlation_id: z.string().optional(),
    details: z
      .array(
        z.object({
          field: z.string().optional(),
          code: z.string(),
          message: z.string(),
        })
      )
      .optional(),
  }),
});

export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>;

export const paginationParamsSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(200).default(50),
  q: z.string().optional(),
  category: z.string().optional(),
  archived: z.coerce.boolean().optional(),
  out_of_stock: z.coerce.boolean().optional(),
  sort: z.enum(['order', 'name', 'price', 'category']).default('order'),
  order: z.enum(['asc', 'desc']).default('asc'),
});

export type PaginationParams = z.infer<typeof paginationParamsSchema>;

export const paginatedResponseSchema = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    page: z.number().int().positive(),
    limit: z.number().int().positive(),
    total: z.number().int().nonnegative(),
    items: z.array(item),
  });

export const revisionResponseSchema = z.object({
  rev: z.number().int().nonnegative(),
  last_updated: z.string(),
});

export type RevisionResponse = z.infer<typeof revisionResponseSchema>;
