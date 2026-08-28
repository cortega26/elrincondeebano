import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isContainedWithin } from '../../shared/identity.ts';
import type { JobRunner } from '../services/jobRunner.ts';
import { schedulePreviewBuild, getPreviewDistRoot } from '../services/previewBuild.ts';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.txt': 'text/plain',
  '.xml': 'text/xml',
  '.webmanifest': 'application/manifest+json',
};

function getMimeType(filePath: string): string {
  const dotIndex = filePath.lastIndexOf('.');
  const ext = dotIndex >= 0 ? filePath.slice(dotIndex).toLowerCase() : '';
  if (ext === '.webmanifest') return MIME_TYPES['.webmanifest'] ?? 'application/octet-stream';
  return MIME_TYPES[ext] ?? 'application/octet-stream';
}

export function resolvePreviewFilePath(repoRoot: string, rawRequestUrl: string): string | null {
  const rawPath = rawRequestUrl.split('?')[0] ?? '/';
  let urlPath: string;
  try {
    urlPath = decodeURIComponent(rawPath);
  } catch {
    return null;
  }

  if (urlPath.split('/').includes('..')) return null;

  const prefix = '/api/v1/preview';
  let relative = urlPath;
  if (relative.startsWith(prefix)) {
    relative = relative.slice(prefix.length);
    if (relative === '') relative = '/';
  } else if (relative.startsWith('/preview')) {
    relative = relative.slice('/preview'.length);
    if (relative === '') relative = '/';
  }

  if (!relative.startsWith('/')) relative = `/${relative}`;

  const distRoot = getPreviewDistRoot(repoRoot);
  const filePath = resolve(distRoot, `.${relative === '/' ? '/index.html' : relative}`);

  if (!isContainedWithin(distRoot, filePath)) return null;

  if (!existsSync(filePath)) {
    const indexCandidate = resolve(distRoot, 'index.html');
    if (existsSync(indexCandidate) && isContainedWithin(distRoot, indexCandidate)) {
      const ext = relative.split('.').pop() ?? '';
      const lower = ext.toLowerCase();
      const isAssetRequest =
        [
          'html',
          'js',
          'css',
          'json',
          'png',
          'webp',
          'avif',
          'svg',
          'ico',
          'woff2',
          'xml',
          'webmanifest',
        ].includes(lower) ||
        relative.includes('/assets/') ||
        relative.includes('/_astro/');
      if (isAssetRequest) return null;
      return indexCandidate;
    }
    return null;
  }

  return filePath;
}

export async function previewRoutes(
  app: FastifyInstance,
  repoRoot: string,
  jobRunner: JobRunner
): Promise<void> {
  app.post('/preview/build', async (_request, reply) => {
    const job = schedulePreviewBuild(jobRunner, repoRoot);
    return reply.status(202).send({ job_id: job.id, status: job.status });
  });

  app.get('/preview/*', async (request: FastifyRequest, reply: FastifyReply) => {
    const rawUrl = request.url;
    const filePath = resolvePreviewFilePath(repoRoot, rawUrl);

    if (!filePath) {
      return reply
        .status(404)
        .send({ error: { code: 'NOT_FOUND', message: 'Preview asset not found' } });
    }

    const distRoot = getPreviewDistRoot(repoRoot);
    if (!isContainedWithin(distRoot, filePath) || !existsSync(filePath)) {
      return reply
        .status(404)
        .send({ error: { code: 'NOT_FOUND', message: 'Preview asset not found' } });
    }

    try {
      const content = readFileSync(filePath);
      const contentType = getMimeType(filePath);
      const urlPath = rawUrl.split('?')[0] ?? '';
      const immutable = /-([A-Za-z0-9_-]{8,})\.[a-z0-9]+$/i.test(urlPath);
      return reply
        .header('Content-Type', contentType)
        .header(
          'Cache-Control',
          immutable ? 'public, max-age=31536000, immutable' : 'public, max-age=60'
        )
        .send(content);
    } catch {
      return reply
        .status(404)
        .send({ error: { code: 'NOT_FOUND', message: 'Preview asset not found' } });
    }
  });

  app.get('/preview', async (_request: FastifyRequest, reply: FastifyReply) => {
    const filePath = resolvePreviewFilePath(repoRoot, '/api/v1/preview/');
    if (!filePath || !existsSync(filePath)) {
      return reply
        .status(404)
        .send({ error: { code: 'NOT_FOUND', message: 'Preview not built yet' } });
    }
    try {
      const content = readFileSync(filePath);
      return reply.header('Content-Type', 'text/html').send(content);
    } catch {
      return reply
        .status(404)
        .send({ error: { code: 'NOT_FOUND', message: 'Preview not built yet' } });
    }
  });
}
