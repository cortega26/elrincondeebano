import { z } from 'zod';
import { productSchema } from './product.ts';

// Plan 060 protocol: preview binds the full incoming input (hash + base
// revision) to a durable preview id; apply accepts only the preview id plus
// explicit field resolutions — never reconstructed product fragments.

export const importResolutionSchema = z.object({
  product_id: z.string().min(1),
  field: z.string().min(1),
  resolution: z.enum(['keep_local', 'use_incoming']),
});
export type ImportResolution = z.infer<typeof importResolutionSchema>;

export const importFieldConflictSchema = z.object({
  product_id: z.string().min(1),
  product_name: z.string().default(''),
  field: z.string().min(1),
  local_value: z.unknown(),
  incoming_value: z.unknown(),
});
export type ImportFieldConflict = z.infer<typeof importFieldConflictSchema>;

export const importValidationErrorSchema = z.object({
  product_id: z.string().default(''),
  product_name: z.string().default(''),
  message: z.string().min(1),
});
export type ImportValidationError = z.infer<typeof importValidationErrorSchema>;

export const importPreviewRecordSchema = z.object({
  id: z.string().min(1),
  created_at: z.string(),
  input_hash: z.string().min(1),
  base_rev: z.number().int().nonnegative(),
  // Complete normalized incoming records (valid ones only) — apply resolves
  // choices against these, never against client-supplied fragments.
  incoming: z.array(productSchema),
  additions: z.array(productSchema),
  updates: z.array(productSchema),
  unchanged: z.array(productSchema),
  conflicts: z.array(importFieldConflictSchema),
  validation_errors: z.array(importValidationErrorSchema),
});
export type ImportPreviewRecord = z.infer<typeof importPreviewRecordSchema>;

export const importPreviewResponseSchema = z.object({
  preview_id: z.string().min(1),
  input_hash: z.string().min(1),
  base_rev: z.number().int().nonnegative(),
  summary: z.object({
    additions: z.number().int().nonnegative(),
    updates: z.number().int().nonnegative(),
    unchanged: z.number().int().nonnegative(),
    invalid: z.number().int().nonnegative(),
    conflicts: z.number().int().nonnegative(),
  }),
  additions: z.array(productSchema),
  updates: z.array(productSchema),
  conflicts: z.array(importFieldConflictSchema),
  validation_errors: z.array(importValidationErrorSchema),
});
export type ImportPreviewResponse = z.infer<typeof importPreviewResponseSchema>;

export const importApplyRequestSchema = z.object({
  preview_id: z.string().min(1),
  resolutions: z.array(importResolutionSchema).default([]),
});
export type ImportApplyRequest = z.infer<typeof importApplyRequestSchema>;

export const importApplyResponseSchema = z.object({
  status: z.literal('ok'),
  created: z.number().int().nonnegative(),
  updated: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  errors: z.array(z.string()).optional(),
  resulting_revision: z.number().int().nonnegative(),
});
export type ImportApplyResponse = z.infer<typeof importApplyResponseSchema>;

// CSV export contract (Python parity — import_export_mixin.export_filtered_csv):
// stable column order, UTF-8, no manager metadata beyond the catalog contract.
export const CSV_EXPORT_COLUMNS = [
  'name',
  'description',
  'price',
  'discount',
  'stock',
  'category',
  'image_path',
  'image_avif_path',
  'order',
] as const;

export const csvExportQuerySchema = z.object({
  q: z.string().optional(),
  category: z.string().optional(),
  archived: z.enum(['true', 'false']).optional(),
  out_of_stock: z.enum(['true', 'false']).optional(),
});
export type CsvExportQuery = z.infer<typeof csvExportQuerySchema>;
