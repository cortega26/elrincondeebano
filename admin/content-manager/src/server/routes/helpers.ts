import type { FastifyReply } from 'fastify';
import { ProductService } from '../../domain/products/productService.ts';

// Plan 197: the Repositories bundle moved to repositories/types.ts (types
// only) to break the changeSetApplier → routes/helpers type cycle.
// Re-exported here so the existing `from './helpers.ts'` imports keep working.
export type { Repositories } from '../repositories/types.ts';

// Plan 094: single write-mode guard — was copy-pasted into every mutation
// route (15 blocks with identical 403 semantics).
export function requireWriteMode(reply: FastifyReply, productService: ProductService): boolean {
  if (!productService.isEnabled) {
    reply
      .status(403)
      .send({ error: { code: 'FORBIDDEN', message: 'Write operations are disabled' } });
    return false;
  }
  return true;
}
