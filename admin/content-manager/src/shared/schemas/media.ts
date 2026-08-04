import { z } from 'zod';

export const mediaIntentTypeSchema = z.enum([
  'add',
  'copy',
  'move',
  'convert',
  'generate',
  'remove',
]);

export type MediaIntentType = z.infer<typeof mediaIntentTypeSchema>;

export const mediaIntentStatusSchema = z.enum([
  'pending',
  'staged',
  'failed',
  'applied',
  'discarded',
]);

export type MediaIntentStatus = z.infer<typeof mediaIntentStatusSchema>;

export const mediaIntentSchema = z.object({
  id: z.string(),
  type: mediaIntentTypeSchema,
  status: mediaIntentStatusSchema.default('pending'),
  sourcePath: z.string().optional(),
  targetPath: z.string(),
  productId: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  created_at: z.string(),
  error: z.string().optional(),
});

export type MediaIntent = z.infer<typeof mediaIntentSchema>;

export const mediaItemSchema = z.object({
  path: z.string(),
  name: z.string(),
  size: z.number().int().nonnegative().default(0),
  ext: z.string(),
  status: z.enum(['active', 'orphan', 'generated', 'staged', 'missing']),
  productName: z.string().optional(),
});

export type MediaItem = z.infer<typeof mediaItemSchema>;

export const mediaInventorySchema = z.object({
  total: z.number().int().nonnegative(),
  active: z.number().int().nonnegative(),
  orphans: z.number().int().nonnegative(),
  generated: z.number().int().nonnegative(),
  staged: z.number().int().nonnegative(),
  missing: z.number().int().nonnegative(),
  items: z.array(mediaItemSchema),
});

export type MediaInventory = z.infer<typeof mediaInventorySchema>;

export const VALID_IMAGE_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.avif',
  '.svg',
]);

export const ALLOWED_MEDIA_DIRS = ['assets/images/'];

export function isSafeMediaPath(path: string): boolean {
  const normalized = path.replace(/\\/g, '/');

  if (normalized.includes('..')) return false;
  if (normalized.startsWith('/')) return false;

  return ALLOWED_MEDIA_DIRS.some((dir) => normalized.startsWith(dir));
}

export function getMediaExtension(path: string): string {
  const lastDot = path.lastIndexOf('.');
  if (lastDot === -1) return '';
  return path.slice(lastDot).toLowerCase();
}

export function isValidMediaExtension(path: string): boolean {
  const ext = getMediaExtension(path);
  return VALID_IMAGE_EXTENSIONS.has(ext);
}
