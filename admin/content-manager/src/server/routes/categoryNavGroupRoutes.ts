import { navGroupRecordSchema } from '../../shared/schemas/category.ts';
import { requireWriteMode } from './helpers.ts';
import { runRegistryCommand } from './catalog-command.ts';
import { type CategoryRouteContext, readBaseRevision } from './categories-common.ts';

// Plan 198: nav-groups slice of categoryRoutes (move-only split).
export async function registerCategoryNavGroupRoutes({
  app,
  repos,
  productService,
  categoryService,
}: CategoryRouteContext): Promise<void> {
  app.post('/nav-groups', async (request, reply) => {
    if (!requireWriteMode(reply, productService)) return;

    const parsed = navGroupRecordSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: parsed.error.issues.map((i) => i.message).join('; '),
        },
      });
    }

    return runRegistryCommand({
      reply,
      load: () => repos.categories.load(),
      getBaseRevision: () => readBaseRevision(request.body),
      successStatus: 201,
      apply: (registry) => {
        const result = categoryService.addNavGroup(registry, parsed.data);
        if (!result.ok) {
          return {
            ok: false,
            statusCode: 409,
            code: 'CONFLICT',
            message: result.error ?? 'Nav group create failed',
          };
        }
        return { ok: true, data: result.group };
      },
      write: (freshRegistry, baseRevision) => repos.categories.write(freshRegistry, baseRevision),
      onSuccess: (_registry, data, writeRev) => ({
        ...(data as Record<string, unknown>),
        rev: writeRev,
        resulting_revision: writeRev,
      }),
    });
  });

  // Plan 096: edit nav-group fields (label, order, enabled) without
  // recreating it.
  app.patch('/nav-groups/:id', async (request, reply) => {
    if (!requireWriteMode(reply, productService)) return;

    const { id } = request.params as { id: string };

    const body = request.body as Record<string, unknown>;
    const allowed: Array<'display_name' | 'active' | 'sort_order'> = [
      'display_name',
      'active',
      'sort_order',
    ];
    const envelopeFields = new Set(['base_revision', 'command_id']);
    const unknown = Object.keys(body).filter(
      (k) => !allowed.includes(k as never) && !envelopeFields.has(k)
    );
    if (unknown.length > 0) {
      return reply.status(400).send({
        error: { code: 'BAD_REQUEST', message: `Unsupported field(s): ${unknown.join(', ')}` },
      });
    }

    const groupId = id;
    return runRegistryCommand({
      reply,
      load: () => repos.categories.load(),
      getBaseRevision: () => readBaseRevision(request.body),
      apply: (registry) => {
        const target = (registry.nav_groups ?? []).find((g) => g.id === groupId);
        if (!target) {
          return {
            ok: false,
            statusCode: 404,
            code: 'NOT_FOUND',
            message: `Nav group "${groupId}" not found`,
          };
        }
        if (body.display_name !== undefined) {
          target.display_name = body.display_name as { default?: string };
        }
        if (body.active !== undefined) target.active = body.active as boolean;
        if (body.sort_order !== undefined) target.sort_order = body.sort_order as number;
        return { ok: true, data: target };
      },
      write: (freshRegistry, baseRevision) => repos.categories.write(freshRegistry, baseRevision),
      onSuccess: (_registry, data, writeRev) => ({
        ...(data as Record<string, unknown>),
        rev: writeRev,
        resulting_revision: writeRev,
      }),
    });
  });

  app.delete('/nav-groups/:id', async (request, reply) => {
    if (!requireWriteMode(reply, productService)) return;

    const { id } = request.params as { id: string };

    return runRegistryCommand({
      reply,
      load: () => repos.categories.load(),
      getBaseRevision: () => readBaseRevision(request.body),
      apply: (registry) => {
        const result = categoryService.removeNavGroup(registry, id);
        if (!result.ok) {
          // Plan 094: typed code from the service.
          return {
            ok: false,
            statusCode: result.code === 'NOT_FOUND' ? 404 : 409,
            code: result.code ?? 'CONFLICT',
            message: result.error ?? 'Category operation failed',
          };
        }
        return { ok: true };
      },
      write: (freshRegistry, baseRevision) => repos.categories.write(freshRegistry, baseRevision),
      successStatus: 204,
      onSuccess: () => undefined,
    });
  });
}
