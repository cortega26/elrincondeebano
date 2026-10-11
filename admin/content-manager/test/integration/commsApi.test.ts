import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../../src/server/app.ts';
import { seedDocument } from '../../src/shared/comms.ts';
import { COMMS_RELATIVE_PATH } from '../../src/server/repositories/commsRepository.ts';

// Plan 217: API de comunicaciones contra un repo temporal.

function makeRepo(): string {
  const dir = resolve(tmpdir(), `cm-comms-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(resolve(dir, 'data'), { recursive: true });
  mkdirSync(resolve(dir, 'astro-poc', 'src', 'data'), { recursive: true });
  writeFileSync(
    resolve(dir, 'data', 'product_data.json'),
    JSON.stringify({ version: 't', products: [] })
  );
  writeFileSync(
    resolve(dir, 'data', 'category_registry.json'),
    JSON.stringify({ nav_groups: [], categories: [] })
  );
  writeFileSync(
    resolve(dir, 'astro-poc', 'src', 'data', 'storefront-experience.json'),
    JSON.stringify({ trustBar: {}, home: {}, bundles: [] })
  );
  return dir;
}

describe('comms API', () => {
  let dir: string;
  let app: FastifyInstance;

  beforeEach(async () => {
    dir = makeRepo();
    app = createApp({ repoRoot: dir, enableWrites: true });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('GET devuelve el documento inicial sin crear archivos y con no-store', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/comms' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.json().templates.length).toBeGreaterThan(5);
    expect(existsSync(resolve(dir, COMMS_RELATIVE_PATH))).toBe(false);
  });

  it('PUT guarda, incrementa rev y persiste con permisos 0600', async () => {
    const doc = seedDocument();
    const next = {
      ...doc,
      destinations: [
        ...doc.destinations,
        { id: 'ct-1', kind: 'contacto', alias: 'Depto 101', name: 'Ana', phone: '56912345678' },
      ],
    };
    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/comms',
      payload: { expected_rev: 0, document: next },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().rev).toBe(1);
    const file = resolve(dir, COMMS_RELATIVE_PATH);
    expect(JSON.parse(readFileSync(file, 'utf8')).destinations).toHaveLength(2);
    if (process.platform !== 'win32') expect(statSync(file).mode & 0o777).toBe(0o600);

    const again = await app.inject({ method: 'GET', url: '/api/v1/comms' });
    expect(again.json().rev).toBe(1);
  });

  it('PUT con revisión vieja responde 409 sin sobrescribir', async () => {
    const doc = seedDocument();
    await app.inject({
      method: 'PUT',
      url: '/api/v1/comms',
      payload: { expected_rev: 0, document: doc },
    });
    const stale = await app.inject({
      method: 'PUT',
      url: '/api/v1/comms',
      payload: { expected_rev: 0, document: { ...doc, templates: [] } },
    });
    expect(stale.statusCode).toBe(409);
    const current = await app.inject({ method: 'GET', url: '/api/v1/comms' });
    expect(current.json().templates.length).toBe(doc.templates.length);
  });

  it('PUT inválido responde 400/422', async () => {
    const noRev = await app.inject({
      method: 'PUT',
      url: '/api/v1/comms',
      payload: { document: {} },
    });
    expect(noRev.statusCode).toBe(400);
    const doc = seedDocument();
    const invalid = await app.inject({
      method: 'PUT',
      url: '/api/v1/comms',
      payload: {
        expected_rev: 0,
        document: { ...doc, templates: [...doc.templates, doc.templates[0]] },
      },
    });
    expect(invalid.statusCode).toBe(422);
  });

  it('un archivo corrupto se informa, no se reemplaza en silencio', async () => {
    const file = resolve(dir, COMMS_RELATIVE_PATH);
    mkdirSync(resolve(dir, 'data', '.comms'), { recursive: true });
    writeFileSync(file, '{corrupto');
    const res = await app.inject({ method: 'GET', url: '/api/v1/comms' });
    expect(res.statusCode).toBe(500);
    expect(readFileSync(file, 'utf8')).toBe('{corrupto');
  });

  it('bloquea lectura y escritura desde un Host no loopback', async () => {
    const read = await app.inject({
      method: 'GET',
      url: '/api/v1/comms',
      headers: { host: '192.168.1.10:3000' },
    });
    expect([401, 403]).toContain(read.statusCode);
    const write = await app.inject({
      method: 'PUT',
      url: '/api/v1/comms',
      headers: { host: '192.168.1.10:3000' },
      payload: { expected_rev: 0, document: seedDocument() },
    });
    expect([401, 403]).toContain(write.statusCode);
  });

  it('en modo solo lectura el PUT se rechaza', async () => {
    const ro = createApp({ repoRoot: dir, enableWrites: false });
    await ro.ready();
    const res = await ro.inject({
      method: 'PUT',
      url: '/api/v1/comms',
      payload: { expected_rev: 0, document: seedDocument() },
    });
    expect(res.statusCode).toBe(405);
    await ro.close();
  });
});

describe('privacidad del archivo de comunicaciones', () => {
  it('git ignora data/.comms/ y sus respaldos en este repositorio', () => {
    const repoRoot = resolve(process.cwd(), '..', '..');
    for (const path of [COMMS_RELATIVE_PATH, `${COMMS_RELATIVE_PATH}.backup_20261010`]) {
      const out = execFileSync('git', ['check-ignore', path], { cwd: repoRoot }).toString().trim();
      expect(out).toBe(path);
    }
  });
});
