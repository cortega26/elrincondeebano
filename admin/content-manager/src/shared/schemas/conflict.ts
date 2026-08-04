import { z } from 'zod';

export const conflictStatusSchema = z.enum([
  'unresolved',
  'resolving',
  'resolved',
  'retrying',
  'failed',
]);

export type ConflictStatus = z.infer<typeof conflictStatusSchema>;

export const fieldConflictSchema = z.object({
  field: z.string(),
  base_value: z.unknown(),
  local_value: z.unknown(),
  server_value: z.unknown(),
  resolution: z.enum(['local', 'server', 'manual', 'unresolved']).default('unresolved'),
  manual_value: z.unknown().optional(),
  resolved_at: z.string().optional(),
});

export type FieldConflict = z.infer<typeof fieldConflictSchema>;

export const conflictSchema = z.object({
  id: z.string(),
  status: conflictStatusSchema.default('unresolved'),
  entity_type: z.enum(['product', 'category', 'storefront']),
  entity_id: z.string(),
  entity_name: z.string().optional(),
  base_revision: z.number().int().nonnegative(),
  local_snapshot: z.record(z.string(), z.unknown()),
  server_snapshot: z.record(z.string(), z.unknown()),
  fields: z.array(fieldConflictSchema),
  created_at: z.string(),
  updated_at: z.string(),
  retry_count: z.number().int().nonnegative().default(0),
  last_error: z.string().optional(),
  resolution_audit: z
    .array(
      z.object({
        timestamp: z.string(),
        field: z.string(),
        from: z.string(),
        to: z.string(),
      })
    )
    .default([]),
});

export type Conflict = z.infer<typeof conflictSchema>;

export const conflictFilterSchema = z.object({
  status: conflictStatusSchema.optional(),
  entity_type: conflictSchema.shape.entity_type.optional(),
});

export type ConflictFilter = z.infer<typeof conflictFilterSchema>;

export function generateConflictId(): string {
  return `conflict-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
