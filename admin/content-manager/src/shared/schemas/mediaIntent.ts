import { z } from 'zod';

// Durable media intents (plan 063 step 1): versioned, persisted, truthful
// status. Staged files live under data/.media-staging/ and are only promoted
// to canonical paths by apply.
export const mediaIntentSchema = z.object({
  version: z.literal(1),
  id: z.string(),
  type: z.enum(['avif', 'variant', 'og', 'og-delete']),
  status: z
    .enum(['pending', 'running', 'succeeded', 'failed', 'cancelled', 'applied'])
    .default('pending'),
  source_path: z.string().optional(),
  target_path: z.string().optional(),
  staged_file: z.string().optional(),
  staged_sha256: z.string().optional(),
  product_id: z.string().optional(),
  category_slug: z.string().optional(),
  outputs: z.array(z.string()).default([]),
  progress: z.number().int().min(0).max(100).default(0),
  errors: z.array(z.string()).default([]),
  created_at: z.string(),
  updated_at: z.string(),
  completed_at: z.string().nullable().default(null),
  change_set_id: z.string().nullable().default(null),
  cancel_requested: z.boolean().default(false),
});

export type MediaIntent = z.infer<typeof mediaIntentSchema>;

export function generateMediaIntentId(): string {
  return `intent-${Date.now()}-${globalThis.crypto.randomUUID().slice(0, 8)}`;
}

export const MEDIA_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
