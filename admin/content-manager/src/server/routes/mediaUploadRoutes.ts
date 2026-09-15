import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { MEDIA_UPLOAD_MAX_BYTES } from '../../shared/schemas/mediaIntent.ts';
import { HttpError, sanitizeUserMessage } from '../../shared/errors/AppError.ts';
import type { MediaRouteContext } from './media-common.ts';

// Magic-byte signatures per declared content type (plan 063 step 2).
const MAGIC_BYTES: Record<string, (buf: Buffer) => boolean> = {
  'image/png': (b) =>
    b.length >= 8 &&
    b[0] === 0x89 &&
    b[1] === 0x50 &&
    b[2] === 0x4e &&
    b[3] === 0x47 &&
    b[4] === 0x0d &&
    b[5] === 0x0a &&
    b[6] === 0x1a &&
    b[7] === 0x0a,
  'image/jpeg': (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/webp': (b) =>
    b.length >= 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP',
  'image/avif': (b) =>
    b.length >= 12 &&
    b.toString('ascii', 4, 8) === 'ftyp' &&
    (b.toString('ascii', 8, 12).includes('avif') || b.toString('ascii', 8, 12).includes('avis')),
  'image/gif': (b) =>
    b.length >= 6 &&
    (b.toString('ascii', 0, 6) === 'GIF87a' || b.toString('ascii', 0, 6) === 'GIF89a'),
};

const EXTENSION_FOR_TYPE: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/gif': 'gif',
};

const ALLOWED_TYPES = Object.keys(MAGIC_BYTES);
// Plan 198: media mediaUpload slice of mediaMutRoutes (move-only split).
export async function registerMediaUploadRoutes({
  app,
  repos,
  media,
  intents,
}: MediaRouteContext): Promise<void> {
  app.get('/media', async () => {
    const products = repos.products.loadCatalog().products;
    const inventory = media.getInventory(products);
    // Enrich inventory with pending intents so the workbench can show them.
    return { ...inventory, intents: intents.listAll() };
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

  // ── Step 2: sniffed, bounded, staged upload ────────────────────────────────

  app.post('/media/upload', async (request, reply) => {
    try {
      const body = request.body as {
        data?: string;
        targetPath?: string;
        content_type?: string;
      };
      const targetPath = body?.targetPath;
      const contentType = body?.content_type;
      const data = body?.data;

      if (!targetPath || !contentType) {
        return reply.status(400).send({
          error: { code: 'BAD_REQUEST', message: 'Missing targetPath or content_type' },
        });
      }
      if (!ALLOWED_TYPES.includes(contentType)) {
        return reply.status(415).send({
          error: {
            code: 'UNSUPPORTED_MEDIA_TYPE',
            message: `Unsupported content type: ${contentType}. Allowed: ${ALLOWED_TYPES.join(', ')}`,
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
      if (decoded.length > MEDIA_UPLOAD_MAX_BYTES) {
        return reply.status(413).send({
          error: {
            code: 'PAYLOAD_TOO_LARGE',
            message: `File size exceeds ${MEDIA_UPLOAD_MAX_BYTES / (1024 * 1024)}MB limit`,
          },
        });
      }
      if (decoded.length === 0) {
        return reply.status(400).send({
          error: { code: 'BAD_REQUEST', message: 'Empty payload' },
        });
      }

      // Content sniffing: declared type must agree with magic bytes.
      const sniff = MAGIC_BYTES[contentType];
      if (!sniff(decoded)) {
        return reply.status(415).send({
          error: {
            code: 'CONTENT_MISMATCH',
            message: `Declared content type ${contentType} does not match the file content`,
          },
        });
      }

      // Stage under the manager-owned root; never write canonical paths.
      const sha256 = createHash('sha256').update(decoded).digest('hex');
      const stagedFile = `${sha256}.${EXTENSION_FOR_TYPE[contentType]}`;
      const stagedPath = resolve(intents.stagingRoot, stagedFile);
      mkdirSync(intents.stagingRoot, { recursive: true });
      writeFileSync(stagedPath, decoded, { flush: true });

      return reply.status(201).send({
        status: 'staged',
        targetPath,
        content_type: contentType,
        size: decoded.length,
        staged_file: stagedFile,
        sha256,
      });
    } catch (err) {
      throw new HttpError(400, 'BAD_REQUEST', sanitizeUserMessage((err as Error).message));
    }
  });
}
