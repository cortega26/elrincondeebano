import type { FastifyReply } from 'fastify';
import type { ProductCatalog } from '../../shared/schemas/product.ts';
import type { Repositories } from './helpers.ts';

export type CatalogCommandApplyResult<T = unknown> =
  | { ok: true; data?: T }
  | { ok: false; statusCode: number; code: string; message: string; details?: unknown };

// Plan 175: same-id concurrency guard — released in a finally on every path
// below, so ids can never leak into permanent rejection.
const inflightCommands = new Set<string>();

export type RegistryCommandApplyResult<T = unknown> =
  { ok: true; data?: T } | { ok: false; statusCode: number; code: string; message: string };

// Plan 194: revision-guarded write helper for registry-style stores
// (categories today) that lack command idempotency. It owns exactly the
// load → apply → revision-guarded write → typed-error-envelope sequence
// that every category route hand-rolled; service validation, response
// shapes, status codes, and side effects (OG scheduling) stay with the
// route via apply/onSuccess. New mutation routes MUST use this (or
// runCatalogCommand for catalog writes) instead of hand-rolling the write.
export async function runRegistryCommand<R, T>(opts: {
  reply: FastifyReply;
  load: () => R;
  getBaseRevision: () => number;
  successStatus?: number;
  apply: (registry: R) => RegistryCommandApplyResult<T> | Promise<RegistryCommandApplyResult<T>>;
  write: (
    registry: R,
    baseRevision: number
  ) => Promise<{ ok: boolean; error?: string; statusCode: number; rev: number }>;
  onSuccess: (
    registry: R,
    data: T | undefined,
    writeRev: number
  ) => Record<string, unknown> | undefined | Promise<Record<string, unknown> | undefined>;
}): Promise<unknown> {
  const { reply, load, getBaseRevision, successStatus = 200, apply, write, onSuccess } = opts;

  const registry = load();
  // The base revision comes from the request body (immutable per request),
  // so reading it here is identical to reading it after apply.
  const baseRevision = getBaseRevision();

  const result = await apply(registry);
  if (!result.ok) {
    const err = result as Extract<RegistryCommandApplyResult<T>, { ok: false }>;
    return reply.status(err.statusCode).send({
      error: { code: err.code, message: err.message },
    });
  }

  const wrote = await write(registry, baseRevision);
  if (!wrote.ok) {
    return reply.status(wrote.statusCode).send({
      error: {
        code: wrote.statusCode === 409 ? 'CONFLICT' : 'INTERNAL_ERROR',
        message: wrote.error,
      },
    });
  }

  const payload = await onSuccess(
    registry,
    (result as Extract<RegistryCommandApplyResult<T>, { ok: true }>).data,
    wrote.rev
  );
  // Plan 194: undefined payload preserves historical empty responses
  // (204 deletes) without a second send path.
  if (payload === undefined) {
    return reply.status(successStatus).send();
  }
  return reply.status(successStatus).send(payload);
}

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

  // Plan 175: replay honesty — a recorded outcome returns WITHOUT re-running
  // apply, so a replayed create can never return an unpersisted phantom
  // product (or advance revisions). writeCatalog's own check stays as the
  // second line of defense; the in-flight set closes the concurrent
  // same-id window between this check and the write.
  const prior = repos.products.peekCommandResult(commandId);
  if (prior) {
    if (prior.status === 'ok') {
      return reply.status(200).send({
        command_id: commandId,
        status: 'ok',
        resulting_revision: prior.resulting_revision,
        deduplicated: true,
      });
    }
    if (prior.status === 'conflict') {
      return reply.status(409).send({
        error: {
          code: 'CONFLICT',
          message: `Command ${commandId} was already recorded as a conflict`,
        },
      });
    }
    return reply.status(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: `Command ${commandId} was already recorded with status ${prior.status}`,
      },
    });
  }
  if (inflightCommands.has(commandId)) {
    return reply.status(409).send({
      error: {
        code: 'COMMAND_IN_FLIGHT',
        message: `Command ${commandId} is already being processed`,
      },
    });
  }
  inflightCommands.add(commandId);

  const catalog = repos.products.loadCatalog();
  const baseRev = catalog.rev;

  try {
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
  } finally {
    inflightCommands.delete(commandId);
  }
}
