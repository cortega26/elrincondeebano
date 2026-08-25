// Plan 127 F2.3: OpenAPI document generated from the shared zod schemas —
// the single source of truth for the client/server contract. The contract
// test (test/contract/openapi.test.ts) walks the client's request paths and
// fails when a route is not declared here.

// The extension must run BEFORE any shared schema module is evaluated —
// ES module evaluation follows the import order, so these two imports come
// first.
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
extendZodWithOpenApi(z);

import { OpenAPIRegistry, OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';
import { productReadSchema, productCatalogSchema } from '../shared/schemas/product.ts';
import { categoryRecordSchema } from '../shared/schemas/category.ts';
import { storefrontBundleSchema } from '../shared/schemas/storefront.ts';

const PRODUCT = '/api/v1/products';
const PRODUCT_ID = '/api/v1/products/{id}';
const CATEGORIES = '/api/v1/categories';
const CATEGORY_ID = '/api/v1/categories/{id}';
const CATEGORY_SUBS = '/api/v1/categories/{id}/subcategories';
const NAV_GROUPS = '/api/v1/nav-groups';
const NAV_GROUP_ID = '/api/v1/nav-groups/{id}';
const BUNDLES = '/api/v1/storefront/bundles';
const FEATURED = '/api/v1/storefront/featured';

const jsonResponse = (schema: z.ZodType, description = 'OK') => ({
  '200': { description, content: { 'application/json': { schema } } },
});

const errorResponse = () => ({
  '4XX': { description: 'Error' },
});

export function buildOpenApi() {
  const registry = new OpenAPIRegistry();

  // Top-level re-wraps of the shared schemas: `extendZodWithOpenApi` must
  // run before schema construction, and the shared modules are also bundled
  // into the web client (no library code there). z.object(shape) rebuilds
  // the same shape with the patched instance — the doc reflects the
  // canonical schemas without polluting the browser bundle.
  registry.register('Product', z.object(productReadSchema.shape));
  registry.register('ProductCatalog', z.object(productCatalogSchema.shape));
  registry.register('Category', z.object(categoryRecordSchema.shape));
  registry.register('Bundle', z.object(storefrontBundleSchema.shape));

  const listProducts = {
    method: 'get' as const,
    path: PRODUCT,
    summary: 'List products (paginated + filters)',
    responses: jsonResponse(
      productCatalogSchema
        .pick({ products: true })
        .extend({ total: z.number(), page: z.number(), pageSize: z.number() })
    ),
  };
  registry.registerPath(listProducts);

  const createProduct = {
    method: 'post' as const,
    path: PRODUCT,
    summary: 'Create a product',
    request: {
      body: {
        content: {
          'application/json': {
            schema: productReadSchema.omit({ rev: true }).extend({ rev: z.number().optional() }),
          },
        },
      },
    },
    responses: jsonResponse(
      z.object({ command_id: z.string(), status: z.string(), product: productReadSchema }),
      'Created'
    ),
  };
  registry.registerPath(createProduct);

  registry.registerPath({
    method: 'get',
    path: PRODUCT_ID,
    summary: 'Get a product by id',
    responses: jsonResponse(productReadSchema),
  });
  registry.registerPath({
    method: 'patch',
    path: PRODUCT_ID,
    summary: 'Update a product',
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({
              command_id: z.string(),
              base_revision: z.number(),
              payload: productReadSchema.partial(),
            }),
          },
        },
      },
    },
    responses: {
      ...jsonResponse(
        z.object({ command_id: z.string(), status: z.string(), product: productReadSchema })
      ),
      ...errorResponse(),
    },
  });
  registry.registerPath({
    method: 'delete',
    path: PRODUCT_ID,
    summary: 'Delete a product',
    responses: jsonResponse(z.object({ status: z.string() }), 'Deleted'),
  });
  registry.registerPath({
    method: 'post',
    path: '/api/v1/products/bulk/preview',
    summary: 'Preview a bulk operation',
    responses: jsonResponse(
      z.object({ ok: z.boolean(), changes: z.array(z.record(z.string(), z.unknown())) })
    ),
  });
  registry.registerPath({
    method: 'post',
    path: '/api/v1/products/bulk/apply',
    summary: 'Apply a bulk operation',
    responses: jsonResponse(
      z.object({
        ok: z.boolean(),
        changed: z.number(),
        changes: z.array(z.record(z.string(), z.unknown())),
      })
    ),
  });
  registry.registerPath({
    method: 'post',
    path: '/api/v1/products/reorder',
    summary: 'Reorder the full catalog',
    responses: jsonResponse(z.object({ status: z.string() })),
  });
  registry.registerPath({
    method: 'post',
    path: '/api/v1/products/batch-update',
    summary: 'Batch update products in one write',
    responses: jsonResponse(
      z.object({ command_id: z.string(), status: z.string(), applied: z.number() })
    ),
  });

  registry.registerPath({
    method: 'get',
    path: CATEGORIES,
    summary: 'List categories',
    responses: jsonResponse(
      z.object({
        rev: z.number(),
        categories: z.array(categoryRecordSchema),
        nav_groups: z.array(z.record(z.string(), z.unknown())),
      })
    ),
  });
  registry.registerPath({
    method: 'post',
    path: CATEGORIES,
    summary: 'Create a category',
    responses: jsonResponse(z.object({ id: z.string(), rev: z.number() }), 'Created'),
  });
  registry.registerPath({
    method: 'patch',
    path: CATEGORY_ID,
    summary: 'Update a category',
    responses: jsonResponse(z.object({ id: z.string(), rev: z.number() })),
  });
  registry.registerPath({
    method: 'delete',
    path: CATEGORY_ID,
    summary: 'Delete a category (optional reassign)',
    responses: jsonResponse(z.object({ status: z.string(), reassigned: z.number() })),
  });
  registry.registerPath({
    method: 'post',
    path: '/api/v1/categories/batch-update',
    summary: 'Batch upsert/delete categories in one write',
    responses: jsonResponse(
      z.object({ command_id: z.string(), status: z.string(), applied: z.number() })
    ),
  });
  registry.registerPath({
    method: 'get',
    path: CATEGORY_SUBS,
    summary: 'List subcategories',
    responses: jsonResponse(z.array(z.record(z.string(), z.unknown()))),
  });
  registry.registerPath({
    method: 'post',
    path: CATEGORY_SUBS,
    summary: 'Create a subcategory',
    responses: jsonResponse(z.object({ status: z.string() }), 'Created'),
  });
  registry.registerPath({
    method: 'patch',
    path: '/api/v1/categories/{id}/subcategories/{subId}',
    summary: 'Update a subcategory',
    responses: jsonResponse(z.object({ status: z.string() })),
  });
  registry.registerPath({
    method: 'delete',
    path: '/api/v1/categories/{id}/subcategories/{subId}',
    summary: 'Delete a subcategory',
    responses: jsonResponse(z.object({ status: z.string() })),
  });

  registry.registerPath({
    method: 'get',
    path: NAV_GROUPS,
    summary: 'List nav groups',
    responses: jsonResponse(z.array(z.record(z.string(), z.unknown()))),
  });
  registry.registerPath({
    method: 'post',
    path: NAV_GROUPS,
    summary: 'Create a nav group',
    responses: jsonResponse(z.object({ status: z.string() }), 'Created'),
  });
  registry.registerPath({
    method: 'patch',
    path: NAV_GROUP_ID,
    summary: 'Update a nav group',
    responses: jsonResponse(z.object({ status: z.string() })),
  });
  registry.registerPath({
    method: 'delete',
    path: NAV_GROUP_ID,
    summary: 'Delete a nav group',
    responses: jsonResponse(z.object({ status: z.string() })),
  });

  registry.registerPath({
    method: 'get',
    path: BUNDLES,
    summary: 'Get storefront bundles',
    responses: jsonResponse(z.object({ bundles: z.array(storefrontBundleSchema) })),
  });
  registry.registerPath({
    method: 'put',
    path: BUNDLES,
    summary: 'Save storefront bundles',
    responses: jsonResponse(z.object({ status: z.string(), bundle_count: z.number() })),
  });
  registry.registerPath({
    method: 'get',
    path: FEATURED,
    summary: 'Get featured sections',
    responses: jsonResponse(
      z.object({ featuredStaples: z.array(z.record(z.string(), z.unknown())) })
    ),
  });
  registry.registerPath({
    method: 'put',
    path: FEATURED,
    summary: 'Save featured sections',
    responses: jsonResponse(z.object({ status: z.string() })),
  });

  registry.registerPath({
    method: 'get',
    path: '/api/v1/media',
    summary: 'Media inventory',
    responses: jsonResponse(z.object({ items: z.array(z.record(z.string(), z.unknown())) })),
  });
  registry.registerPath({
    method: 'get',
    path: '/api/v1/git/status',
    summary: 'Git status',
    responses: jsonResponse(z.record(z.string(), z.unknown())),
  });
  registry.registerPath({
    method: 'post',
    path: '/api/v1/git/pull',
    summary: 'Git pull',
    responses: jsonResponse(z.object({ job_id: z.string(), status: z.string() })),
  });
  registry.registerPath({
    method: 'post',
    path: '/api/v1/import/preview',
    summary: 'Import preview',
    responses: jsonResponse(z.record(z.string(), z.unknown())),
  });
  registry.registerPath({
    method: 'post',
    path: '/api/v1/import/apply',
    summary: 'Import apply',
    responses: jsonResponse(z.record(z.string(), z.unknown())),
  });
  registry.registerPath({
    method: 'get',
    path: '/api/v1/export',
    summary: 'Export catalog',
    responses: jsonResponse(productCatalogSchema),
  });
  registry.registerPath({
    method: 'get',
    path: '/api/v1/publications',
    summary: 'Publications',
    responses: jsonResponse(z.array(z.record(z.string(), z.unknown()))),
  });
  registry.registerPath({
    method: 'post',
    path: '/api/v1/publications',
    summary: 'Create a publication',
    responses: jsonResponse(z.object({ job_id: z.string(), status: z.string() }), 'Created'),
  });
  registry.registerPath({
    method: 'post',
    path: '/api/v1/publications/preview',
    summary: 'Publication preview',
    responses: jsonResponse(z.record(z.string(), z.unknown())),
  });

  registry.registerPath({
    method: 'get',
    path: '/api/v1/jobs/{id}',
    summary: 'Get a job status',
    responses: jsonResponse(z.record(z.string(), z.unknown())),
  });
  registry.registerPath({
    method: 'post',
    path: '/api/v1/jobs/{id}/cancel',
    summary: 'Cancel a job',
    responses: jsonResponse(z.record(z.string(), z.unknown())),
  });

  return new OpenApiGeneratorV3(registry.definitions).generateDocument({
    openapi: '3.0.0',
    info: { title: 'El Rincón de Ébano Content Manager', version: '1.0.0' },
    servers: [{ url: '/api/v1' }],
  });
}

// Plan 150: static document — built once per process. The generator is pure
// (no request inputs) so memoizing is safe; if request-dependent inputs are
// ever added, this MUST be revisited.
export const openApiDocument = buildOpenApi();
