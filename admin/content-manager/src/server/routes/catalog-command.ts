import type { FastifyReply } from 'fastify';
import type { ProductCatalog } from '../../shared/schemas/product.ts';
import type { Repositories } from './helpers.ts';

export type CatalogCommandApplyResult<T = unknown> =
  | { ok: true; data?: T }
  | { ok: false; statusCode: number; code: string; message: string; details?: unknown };

export async function runCatalogCommand<T>(opts: {
  repos: Repositories;
  reply: FastifyReply;
  commandId: string | undefined;
  missingMessage?: string;
  successStatus?: number;
  apply: (
    catalog: ProductCatalog
  ) => CatalogCommandApplyResult<T> | Promise<CatalogCommandApplyResult<T>>;
  onSuccess: (
    catalog: ProductCatalog,
    data: T | undefined
  ) => Record<string, unknown> | Promise<Record<string, unknown>>;
}): Promise<unknown> {
  const {
    repos,
    reply,
    commandId,
    missingMessage = 'Missing command_id',
    successStatus = 200,
    apply,
    onSuccess,
  } = opts;

  if (!commandId) {
    return reply.status(400).send({ error: { code: 'BAD_REQUEST', message: missingMessage } });
  }

  const catalog = repos.products.loadCatalog();
  const baseRev = catalog.rev;

  const result = await apply(catalog);

  if (!result.ok) {
    const err = result as Extract<CatalogCommandApplyResult<T>, { ok: false }>;
    return reply.status(err.statusCode).send({
      error: {
        code: err.code,
        message: err.message,
        ...(err.details !== undefined ? { details: err.details } : {}),
      },
    });
  }

  const writeResult = await repos.products.writeCatalog(catalog, commandId, baseRev);

  if (!writeResult.ok) {
    return reply.status(writeResult.statusCode).send({
      error: { code: 'CONFLICT', message: writeResult.error },
    });
  }

  const payload = await onSuccess(
    catalog,
    (result as Extract<CatalogCommandApplyResult<T>, { ok: true }>).data
  );

  return reply.status(successStatus).send({
    command_id: commandId,
    status: 'ok',
    resulting_revision: catalog.rev,
    ...payload,
  });
}
