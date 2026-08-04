import { z } from 'zod';

export const changeSetStatusSchema = z.enum([
  'draft',
  'validating',
  'validated',
  'publishing',
  'published',
  'failed',
  'discarded',
]);

export type ChangeSetStatus = z.infer<typeof changeSetStatusSchema>;

export const changeSetSchema = z.object({
  id: z.string(),
  status: changeSetStatusSchema.default('draft'),
  created_at: z.string(),
  updated_at: z.string(),
  product_ops: z
    .array(
      z.object({
        action: z.enum(['create', 'edit', 'archive', 'restore']),
        product_id: z.string().optional(),
        data: z.record(z.string(), z.unknown()),
        base_revision: z.number().int().nonnegative().optional(),
      })
    )
    .default([]),
  category_ops: z
    .array(
      z.object({
        action: z.enum(['create', 'edit', 'delete', 'reorder']),
        category_id: z.string().optional(),
        data: z.record(z.string(), z.unknown()),
      })
    )
    .default([]),
  validation_evidence: z.any().nullable().default(null),
  publication_result: z.any().nullable().default(null),
});

export type ChangeSet = z.infer<typeof changeSetSchema>;

export const ALLOWED_TRANSITIONS: Record<ChangeSetStatus, ChangeSetStatus[]> = {
  draft: ['validating', 'discarded'],
  validating: ['validated', 'failed', 'draft'],
  validated: ['publishing', 'draft'],
  publishing: ['published', 'failed'],
  published: [],
  failed: ['validating', 'discarded'],
  discarded: [],
};

export function isValidTransition(from: ChangeSetStatus, to: ChangeSetStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export function generateChangeSetId(): string {
  return `cs-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
