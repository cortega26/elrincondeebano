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
import { changeSetSchema } from '../shared/schemas/changeSet.ts';
import { conflictSchema } from '../shared/schemas/conflict.ts';
import { mediaIntentSchema } from '../shared/schemas/mediaIntent.ts';
import { syncConfigSchema } from './adapters/syncAdapter.ts';

const PRODUCT = '/api/v1/products';
const PRODUCT_ID = '/api/v1/products/{id}';
const CATEGORIES = '/api/v1/categories';
const CATEGORY_ID = '/api/v1/categories/{id}';
const CATEGORY_SUBS = '/api/v1/categories/{id}/subcategories';
const NAV_GROUPS = '/api/v1/nav-groups';
const NAV_GROUP_ID = '/api/v1/nav-groups/{id}';
const BUNDLES = '/api/v1/storefront/bundles';
const FEATURED = '/api/v1/storefront/featured';
const MEDIA_INTENTS = '/api/v1/media/intents';
const MEDIA_INTENT_ID = '/api/v1/media/intents/{id}';
const CHANGE_SET_ID = '/api/v1/change-sets/{id}';

const jsonResponse = (schema: z.ZodType, description = 'OK') => ({
  '200': { description, content: { 'application/json': { schema } } },
});

const createdResponse = (schema: z.ZodType, description = 'Created') => ({
  '201': { description, content: { 'application/json': { schema } } },
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
  registry.register('ChangeSet', z.object(changeSetSchema.shape));
  registry.register('Conflict', z.object(conflictSchema.shape));
  registry.register('MediaIntent', z.object(mediaIntentSchema.shape));

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
  // Plan 252: catalog revision probe (productRoutes.ts:131 →
  // ProductRepository.getRevision()); used by mediaApplyOutputs and the UI.
  registry.registerPath({
    method: 'get',
    path: '/api/v1/products/revision',
    summary: 'Get the catalog revision and last-updated timestamp',
    responses: jsonResponse(z.object({ rev: z.number(), last_updated: z.string() })),
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
  // Plan 252: single-category read + reorder, and subcategory reorder
  // (categoryCrudRoutes.ts:28/310, categorySubcategoryRoutes.ts:196).
  registry.registerPath({
    method: 'get',
    path: '/api/v1/categories/{key}',
    summary: 'Get a category by key',
    responses: { ...jsonResponse(categoryRecordSchema), ...errorResponse() },
  });
  registry.registerPath({
    method: 'post',
    path: '/api/v1/categories/reorder',
    summary: 'Reorder categories in one registry write',
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({
              ordered_ids: z.array(z.string()),
              base_revision: z.number().optional(),
            }),
          },
        },
      },
    },
    responses: {
      ...jsonResponse(
        z.object({
          status: z.string(),
          reordered: z.number(),
          rev: z.number(),
          resulting_revision: z.number(),
        })
      ),
      ...errorResponse(),
    },
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
    method: 'post',
    path: '/api/v1/categories/{id}/subcategories/reorder',
    summary: 'Reorder the subcategories of a category',
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({
              ordered_ids: z.array(z.string()),
              base_revision: z.number().optional(),
            }),
          },
        },
      },
    },
    responses: {
      ...jsonResponse(
        z.object({
          status: z.string(),
          reordered: z.number(),
          rev: z.number(),
          resulting_revision: z.number(),
        })
      ),
      ...errorResponse(),
    },
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
  // Plan 252: the media workbench lifecycle (upload → staged intent → run →
  // apply/discard), declared from the handlers in mediaUploadRoutes.ts /
  // mediaIntentRoutes.ts / mediaApplyRoutes.ts and their integration tests
  // (test/integration/mediaWorkbench.test.ts).
  registry.registerPath({
    method: 'get',
    path: '/api/v1/media/validate',
    summary: 'Validate a media target path (assets/images containment)',
    request: { query: z.object({ path: z.string() }) },
    responses: {
      ...jsonResponse(z.object({ ok: z.boolean(), error: z.string().optional() })),
      ...errorResponse(),
    },
  });
  registry.registerPath({
    method: 'post',
    path: '/api/v1/media/upload',
    summary: 'Stage an uploaded media file (base64, magic-byte sniffed, size-capped)',
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({
              data: z.string().optional(),
              targetPath: z.string(),
              // MAGIC_BYTES keys in mediaUploadRoutes.ts — the sniffed allowlist.
              content_type: z.enum([
                'image/png',
                'image/jpeg',
                'image/webp',
                'image/avif',
                'image/gif',
              ]),
            }),
          },
        },
      },
    },
    responses: {
      ...createdResponse(
        z.object({
          status: z.string(),
          targetPath: z.string(),
          content_type: z.string(),
          size: z.number().optional(),
          staged_file: z.string().optional(),
          sha256: z.string().optional(),
        })
      ),
      ...errorResponse(),
    },
  });
  registry.registerPath({
    method: 'post',
    path: MEDIA_INTENTS,
    summary: 'Create a media intent (staged_file → target_path)',
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({
              type: z.enum(['avif', 'variant', 'og', 'og-delete']),
              staged_file: z.string().optional(),
              target_path: z.string(),
              product_id: z.string().optional(),
              category_slug: z.string().optional(),
            }),
          },
        },
      },
    },
    responses: { ...createdResponse(mediaIntentSchema), ...errorResponse() },
  });
  registry.registerPath({
    method: 'post',
    path: '/api/v1/media/intents/{id}/run',
    summary: 'Run a media intent job',
    responses: {
      ...jsonResponse(z.object({ status: z.string(), intent_id: z.string() })),
      ...errorResponse(),
    },
  });
  registry.registerPath({
    method: 'post',
    path: '/api/v1/media/intents/{id}/cancel',
    summary: 'Cancel a pending/running media intent',
    responses: {
      ...jsonResponse(z.object({ status: z.string(), intent_id: z.string() })),
      ...errorResponse(),
    },
  });
  registry.registerPath({
    method: 'post',
    path: '/api/v1/media/intents/{id}/apply',
    summary: 'Apply a succeeded media intent (promote staged outputs to canonical)',
    responses: {
      ...jsonResponse(
        z.object({
          status: z.string(),
          intent_id: z.string(),
          promoted: z.number(),
          canonical: z.string().optional(),
        })
      ),
      ...errorResponse(),
    },
  });
  registry.registerPath({
    method: 'delete',
    path: MEDIA_INTENT_ID,
    summary: 'Discard a media intent (staged files only, never canonical assets)',
    responses: {
      ...jsonResponse(z.object({ status: z.string(), intent_id: z.string() })),
      ...errorResponse(),
    },
  });
  registry.registerPath({
    method: 'post',
    path: '/api/v1/media/intents/batch',
    summary: 'Batch run/cancel/discard media intents',
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({
              action: z.enum(['run', 'cancel', 'discard']),
              ids: z.array(z.string()),
            }),
          },
        },
      },
    },
    responses: {
      ...jsonResponse(
        z.object({
          status: z.string(),
          action: z.string(),
          applied: z.number(),
          skipped: z.array(z.object({ id: z.string(), reason: z.string() })),
        })
      ),
      ...errorResponse(),
    },
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
    // Plan 197: visible since exportCsv joined the unified client core —
    // the contract test extracts its path from the domain modules.
    method: 'get',
    path: '/api/v1/export.csv',
    summary: 'Export catalog (CSV)',
    responses: {
      '200': { description: 'OK', content: { 'text/csv': { schema: z.string() } } },
    },
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
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({
              commitMessage: z.string().optional(),
              push: z.boolean().optional(),
              publishAt: z.string().optional(),
            }),
          },
        },
      },
    },
    responses: jsonResponse(z.object({ job_id: z.string(), status: z.string() }), 'Created'),
  });
  registry.registerPath({
    method: 'post',
    path: '/api/v1/publications/preview',
    summary: 'Publication preview',
    responses: jsonResponse(z.record(z.string(), z.unknown())),
  });
  // Plan 252: publication recovery journal (publication.ts:272 →
  // RecoveryJournal.load()); `state` is null when no crash was recorded.
  registry.registerPath({
    method: 'get',
    path: '/api/v1/publications/recovery',
    summary: 'Publication recovery journal status',
    responses: jsonResponse(
      z.object({
        pending_recovery: z.boolean(),
        state: z
          .object({
            current_job_id: z.string().optional(),
            current_step: z.string().optional(),
            commit_made: z.boolean().optional(),
            commit_sha: z.string().optional(),
            staged_paths: z.array(z.string()),
            timestamp: z.string(),
          })
          .nullable(),
      })
    ),
  });
  registry.registerPath({
    // Plan 211: flag-gated build+preview trigger (mutation-class route).
    method: 'post',
    path: '/api/v1/preview/build',
    summary: 'Trigger a preview build job',
    responses: jsonResponse(z.object({ job_id: z.string(), status: z.string() }), 'Accepted'),
  });

  registry.registerPath({
    method: 'get',
    path: '/api/v1/jobs',
    summary: 'List pending/running jobs',
    responses: jsonResponse(
      z.object({
        jobs: z.array(
          z.object({
            id: z.string(),
            type: z.string(),
            status: z.string(),
            progress: z.number(),
            started_at: z.string().optional(),
            completed_at: z.string().optional(),
            scheduled_at: z.string().optional(),
          })
        ),
      })
    ),
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

  registry.registerPath({
    method: 'get',
    path: '/api/v1/diagnostics',
    summary: 'Diagnostics report',
    responses: jsonResponse(z.record(z.string(), z.unknown())),
  });
  // Plan 252: unauthenticated bootstrap payload — capabilities, catalog
  // revision and counts only (bootstrap.ts; the launch credential is
  // deliberately not served).
  registry.registerPath({
    method: 'get',
    path: '/api/v1/bootstrap',
    summary: 'Bootstrap payload (capabilities, revision, counts)',
    responses: jsonResponse(
      z.object({
        capabilities: z.object({
          products: z.boolean(),
          categories: z.boolean(),
          storefront: z.boolean(),
          media: z.boolean(),
          changes: z.boolean(),
          publication: z.boolean(),
          sync: z.boolean(),
        }),
        revision: z.object({ products: z.number(), last_updated: z.string() }),
        counts: z.object({
          products: z.number(),
          categories: z.number(),
          nav_groups: z.number(),
          bundles: z.number(),
        }),
      })
    ),
  });
  // Plan 217: comunicaciones privadas (loopback; PUT exige credencial).
  registry.registerPath({
    method: 'get',
    path: '/api/v1/comms',
    summary: 'Private WhatsApp comms document (templates, destinations, activity)',
    responses: jsonResponse(z.record(z.string(), z.unknown())),
  });
  registry.registerPath({
    method: 'put',
    path: '/api/v1/comms',
    summary: 'Replace comms document (optimistic rev check)',
    responses: jsonResponse(z.record(z.string(), z.unknown())),
  });
  registry.registerPath({
    method: 'get',
    path: '/api/v1/history',
    summary: 'History entries',
    responses: jsonResponse(z.record(z.string(), z.unknown())),
  });
  // Plan 252: history revert — applies the recorded before-values as a
  // rev-guarded edit change set (historyRoutes.ts:154).
  registry.registerPath({
    method: 'post',
    path: '/api/v1/history/{productId}/revert',
    summary: 'Revert a product to a recorded change-set revision',
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({ to_rev: z.number().int().nonnegative() }),
          },
        },
      },
    },
    responses: {
      ...jsonResponse(z.object({ status: z.string(), resulting_revision: z.number() })),
      ...errorResponse(),
    },
  });
  // Plan 252: catalog diff (historyRoutes.ts:24) — read-class, compares the
  // `after.products` snapshot against `before.products`.
  registry.registerPath({
    method: 'post',
    path: '/api/v1/diff',
    summary: 'Diff two product snapshots',
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({
              before: z.object({ products: z.array(z.record(z.string(), z.unknown())) }).optional(),
              after: z.object({ products: z.array(z.record(z.string(), z.unknown())) }).optional(),
            }),
          },
        },
      },
    },
    responses: jsonResponse(
      z.object({
        products: z.array(
          z.object({
            field: z.string(),
            old: z.unknown(),
            new: z.unknown(),
            productName: z.string().optional(),
          })
        ),
        categories: z.array(z.unknown()),
        storefront: z.array(z.unknown()),
      })
    ),
  });
  // Plan 252: the change-set lifecycle card (validate/update, apply,
  // discard, undo, redo), declared from changeSetRoutes.ts and
  // test/integration/changeSetWorkflow.test.ts.
  registry.registerPath({
    method: 'get',
    path: '/api/v1/change-sets',
    summary: 'List change sets',
    responses: jsonResponse(z.record(z.string(), z.unknown())),
  });
  registry.registerPath({
    method: 'post',
    path: '/api/v1/change-sets',
    summary: 'Create a draft change set',
    request: {
      body: {
        content: {
          'application/json': {
            // Both op arrays are optional in the handler (default []).
            schema: changeSetSchema
              .pick({ product_ops: true, category_ops: true })
              .partial(),
          },
        },
      },
    },
    responses: { ...createdResponse(changeSetSchema), ...errorResponse() },
  });
  registry.registerPath({
    method: 'get',
    path: CHANGE_SET_ID,
    summary: 'Get a change set by id',
    responses: { ...jsonResponse(changeSetSchema), ...errorResponse() },
  });
  registry.registerPath({
    method: 'patch',
    path: CHANGE_SET_ID,
    summary: 'Validate or update a change set (explicit status transitions)',
    request: {
      body: {
        content: {
          'application/json': {
            // The handler's allowlist (changeSetRoutes.ts:120): server-owned
            // fields (id/created_at/updated_at) are rejected, so they are not
            // part of the patch shape.
            schema: changeSetSchema
              .pick({
                status: true,
                product_ops: true,
                category_ops: true,
                validation_evidence: true,
                publication_result: true,
              })
              .partial(),
          },
        },
      },
    },
    responses: { ...jsonResponse(changeSetSchema), ...errorResponse() },
  });
  registry.registerPath({
    method: 'post',
    path: '/api/v1/change-sets/{id}/apply',
    summary: 'Apply a validated change set exactly once',
    responses: {
      ...jsonResponse(
        z.object({
          status: z.string(),
          applied: z.number(),
          resulting_revision: z.number(),
          change_set_id: z.string(),
        })
      ),
      ...errorResponse(),
    },
  });
  registry.registerPath({
    method: 'post',
    path: '/api/v1/change-sets/{id}/discard',
    summary: 'Discard a non-published change set',
    responses: { ...jsonResponse(z.object({ status: z.string() })), ...errorResponse() },
  });
  registry.registerPath({
    method: 'post',
    path: '/api/v1/change-sets/{id}/undo',
    summary: 'Undo a published change set (new inverse change set)',
    responses: {
      ...jsonResponse(
        z.object({
          status: z.string(),
          undo_change_set_id: z.string(),
          change_set: changeSetSchema,
        })
      ),
      ...errorResponse(),
    },
  });
  registry.registerPath({
    method: 'post',
    path: '/api/v1/change-sets/{id}/redo',
    summary: 'Redo a published inverse change set (new forward change set)',
    responses: {
      ...jsonResponse(
        z.object({
          status: z.string(),
          redo_change_set_id: z.string(),
          change_set: changeSetSchema,
        })
      ),
      ...errorResponse(),
    },
  });
  // Plan 252: backup prune/restore operations (backup.ts), declared with the
  // BackupManager result envelopes.
  registry.registerPath({
    method: 'get',
    path: '/api/v1/backup',
    summary: 'List backups',
    responses: jsonResponse(z.record(z.string(), z.unknown())),
  });
  registry.registerPath({
    method: 'post',
    path: '/api/v1/backup',
    summary: 'Create a verified manual backup',
    responses: {
      ...jsonResponse(
        z.object({ backup_id: z.string(), timestamp: z.string(), files: z.array(z.string()) }),
        'Backup created'
      ),
      ...errorResponse(),
    },
  });
  registry.registerPath({
    method: 'post',
    path: '/api/v1/backup/prune-preview',
    summary: 'Preview which backups can be pruned',
    responses: jsonResponse(
      z.object({ prunable: z.array(z.object({ id: z.string(), reason: z.string() })) })
    ),
  });
  registry.registerPath({
    method: 'post',
    path: '/api/v1/backup/prune',
    summary: 'Prune the given backup ids (protected backups are rejected)',
    request: {
      body: {
        content: { 'application/json': { schema: z.object({ ids: z.array(z.string()) }) } },
      },
    },
    responses: {
      ...jsonResponse(
        z.object({ status: z.string(), pruned: z.number(), warning: z.string().nullable() })
      ),
      ...errorResponse(),
    },
  });
  registry.registerPath({
    method: 'post',
    path: '/api/v1/backup/{id}/restore',
    summary: 'Restore a backup (pre-restore snapshot included)',
    responses: {
      ...jsonResponse(
        z.object({
          status: z.string(),
          backup_id: z.string(),
          pre_restore_snapshot: z.string(),
        })
      ),
      ...errorResponse(),
    },
  });
  registry.registerPath({
    method: 'post',
    path: '/api/v1/backup/reconcile',
    summary: 'Reconcile the backup index against disk',
    responses: jsonResponse(
      z.object({ status: z.string(), added: z.number(), removed: z.number() })
    ),
  });
  registry.registerPath({
    method: 'get',
    path: '/api/v1/sync/status',
    summary: 'Sync status',
    responses: jsonResponse(z.record(z.string(), z.unknown())),
  });
  // Plan 252: sync control surface, declared from conflicts.ts:184-330.
  registry.registerPath({
    method: 'get',
    path: '/api/v1/sync/events',
    summary: 'Sync status SSE stream',
    responses: {
      '200': {
        description:
          'text/event-stream: repeated `data: { sync, capabilities }` frames (same envelope as GET /api/v1/sync/status) plus `: ping` heartbeat comments; max 2 concurrent connections (429 beyond).',
        content: { 'text/event-stream': { schema: z.string() } },
      },
      ...errorResponse(),
    },
  });
  registry.registerPath({
    method: 'put',
    path: '/api/v1/sync/config',
    summary: 'Update sync configuration (api_token is env-only and rejected)',
    request: {
      body: {
        content: {
          'application/json': {
            // api_token deliberately omitted: the handler rejects it (400) —
            // it is supplied via the SYNC_API_TOKEN environment variable.
            schema: syncConfigSchema.omit({ api_token: true }).partial(),
          },
        },
      },
    },
    responses: { ...jsonResponse(syncConfigSchema), ...errorResponse() },
  });
  registry.registerPath({
    method: 'post',
    path: '/api/v1/sync/now',
    summary: 'Run one push+pull sync cycle now',
    responses: jsonResponse(
      z.object({
        ok: z.boolean(),
        message: z.string(),
        pushed: z.number(),
        push_failed: z.number(),
        pulled: z.number(),
        cursor: z.number(),
        pull_error: z.string().nullable(),
      })
    ),
  });
  registry.registerPath({
    method: 'post',
    path: '/api/v1/sync/pause',
    summary: 'Pause background sync',
    responses: jsonResponse(z.object({ status: z.string() })),
  });
  registry.registerPath({
    method: 'post',
    path: '/api/v1/sync/resume',
    summary: 'Resume background sync',
    responses: jsonResponse(z.object({ status: z.string() })),
  });
  registry.registerPath({
    method: 'get',
    path: '/api/v1/conflicts',
    summary: 'List conflicts',
    responses: jsonResponse(z.record(z.string(), z.unknown())),
  });
  // Plan 252: conflict resolution card (resolve/retry), declared from
  // conflicts.ts and test/integration/conflictApi.test.ts.
  registry.registerPath({
    method: 'post',
    path: '/api/v1/conflicts/{id}/resolve',
    summary: 'Resolve one field of a conflict',
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({
              field: z.string(),
              resolution: z.enum(['local', 'server', 'manual']),
              manual_value: z.unknown().optional(),
            }),
          },
        },
      },
    },
    responses: { ...jsonResponse(conflictSchema), ...errorResponse() },
  });
  registry.registerPath({
    method: 'post',
    path: '/api/v1/conflicts/{id}/retry',
    summary: 'Retry a conflict',
    responses: { ...jsonResponse(conflictSchema), ...errorResponse() },
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
