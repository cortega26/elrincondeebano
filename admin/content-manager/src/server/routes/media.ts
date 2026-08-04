import { writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { Repositories } from './catalog.ts';
import { MediaRepository } from '../repositories/mediaRepository.ts';

export async function mediaMutRoutes(
  app: FastifyInstance,
  repos: Repositories,
  media: MediaRepository
): Promise<void> {
  app.get('/media', async () => {
    const products = repos.products.loadCatalog().products;
    const inventory = media.getInventory(products);
    return inventory;
  });

  app.get('/media/validate', async (request, reply) => {
    const query = request.query as { path?: string };
    if (!query.path) {
      return reply
        .status(400)
        .send({ error: { code: 'BAD_REQUEST', message: 'Missing path parameter' } });
    }
    const result = media.validatePath(query.path);
    return result;
  });

  app.post('/media/intents', async (request, reply) => {
    const body = request.body as {
      type?: string;
      sourcePath?: string;
      targetPath?: string;
      productId?: string;
    };
    if (!body?.type || !body?.targetPath) {
      return reply.status(400).send({
        error: { code: 'BAD_REQUEST', message: 'Missing type or targetPath' },
      });
    }

    const pathCheck = media.validatePath(body.targetPath);
    if (!pathCheck.ok) {
      return reply.status(400).send({
        error: { code: 'BAD_REQUEST', message: pathCheck.error },
      });
    }

    if (body.targetPath.includes('..') || body.targetPath.startsWith('/')) {
      return reply.status(400).send({
        error: { code: 'FORBIDDEN', message: 'Path traversal detected' },
      });
    }

    if (body.sourcePath) {
      const sourceCheck = media.validatePath(body.sourcePath);
      if (!sourceCheck.ok) {
        return reply.status(400).send({
          error: { code: 'BAD_REQUEST', message: sourceCheck.error },
        });
      }
    }

    const intent = {
      id: `intent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: body.type,
      status: 'pending',
      sourcePath: body.sourcePath,
      targetPath: body.targetPath,
      productId: body.productId,
      created_at: new Date().toISOString(),
    };

    return reply.status(201).send(intent);
  });

  app.delete('/media/intents/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    return { status: 'discarded', intent_id: id };
  });

  app.post('/media/convert', async (request, reply) => {
    const body = request.body as { sourcePath?: string; targetPath?: string; format?: string };
    if (!body?.sourcePath || !body?.targetPath || body.format !== 'avif') {
      return reply.status(400).send({
        error: {
          code: 'BAD_REQUEST',
          message: "Missing sourcePath, targetPath, or unsupported format (only 'avif' supported)",
        },
      });
    }
    return { status: 'acknowledged', message: 'Conversion delegated to canonical tools' };
  });

  app.post('/media/generate', async (request, reply) => {
    const body = request.body as { type?: string; targetPath?: string };
    if (!body?.type || !body?.targetPath) {
      return reply.status(400).send({
        error: { code: 'BAD_REQUEST', message: 'Missing type or targetPath' },
      });
    }
    const allowedTypes = ['og', 'variant', 'placeholder'];
    if (!allowedTypes.includes(body.type)) {
      return reply.status(400).send({
        error: {
          code: 'BAD_REQUEST',
          message: `Unsupported type: ${body.type}. Allowed: ${allowedTypes.join(', ')}`,
        },
      });
    }
    return { status: 'acknowledged', message: 'Generation delegated to canonical tools' };
  });

  app.post('/media/upload', async (request, reply) => {
    try {
      const body = request.body as { data?: string; targetPath?: string; content_type?: string };
      const targetPath = body?.targetPath;
      const contentType = body?.content_type;
      const data = body?.data;

      if (!targetPath) {
        return reply
          .status(400)
          .send({ error: { code: 'BAD_REQUEST', message: 'Missing targetPath' } });
      }

      if (!contentType) {
        return reply
          .status(400)
          .send({ error: { code: 'BAD_REQUEST', message: 'Missing content_type' } });
      }

      const allowedTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/avif', 'image/gif'];
      if (!allowedTypes.includes(contentType)) {
        return reply.status(415).send({
          error: {
            code: 'UNSUPPORTED_MEDIA_TYPE',
            message: `Unsupported content type: ${contentType}. Allowed: ${allowedTypes.join(', ')}`,
          },
        });
      }

      const pathCheck = media.validatePath(targetPath);
      if (!pathCheck.ok) {
        return reply.status(400).send({ error: { code: 'BAD_REQUEST', message: pathCheck.error } });
      }

      if (!data) {
        return reply.status(201).send({
          status: 'staged',
          targetPath,
          content_type: contentType,
        });
      }

      const decoded = Buffer.from(data, 'base64');
      const MAX_SIZE = 10 * 1024 * 1024;
      if (decoded.length > MAX_SIZE) {
        return reply.status(413).send({
          error: {
            code: 'PAYLOAD_TOO_LARGE',
            message: `File size exceeds ${MAX_SIZE / (1024 * 1024)}MB limit`,
          },
        });
      }

      const fullPath = media.resolveFullPath(targetPath);
      const parentDir = dirname(fullPath);
      const { mkdirSync } = await import('node:fs');
      mkdirSync(parentDir, { recursive: true });
      writeFileSync(fullPath, decoded);

      return reply.status(201).send({
        status: 'uploaded',
        targetPath,
        content_type: contentType,
        size: decoded.length,
      });
    } catch (err) {
      return reply.status(400).send({
        error: { code: 'BAD_REQUEST', message: (err as Error).message },
      });
    }
  });
}
