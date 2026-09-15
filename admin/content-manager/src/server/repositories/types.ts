import type { ProductRepository } from './productRepository.ts';
import type { CategoryRepository } from './categoryRepository.ts';
import type { StorefrontRepository } from './storefrontRepository.ts';

// Plan 197: the repository-bundle type lives here (types only) so services
// can depend on it without importing server/routes/helpers.ts — which pulls
// Fastify + domain services and closed the changeSetApplier → routes
// type cycle. routes/helpers.ts re-exports this for compatibility.
export interface Repositories {
  products: ProductRepository;
  categories: CategoryRepository;
  storefront: StorefrontRepository;
}
