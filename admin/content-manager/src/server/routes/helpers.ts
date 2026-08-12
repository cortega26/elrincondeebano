import type { FastifyReply } from 'fastify';
import type { ProductRepository } from '../repositories/productRepository.ts';
import type { CategoryRepository } from '../repositories/categoryRepository.ts';
import type { StorefrontRepository } from '../repositories/storefrontRepository.ts';
import { ProductService } from '../../domain/products/productService.ts';

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

export interface Repositories {
  products: ProductRepository;
  categories: CategoryRepository;
  storefront: StorefrontRepository;
}
