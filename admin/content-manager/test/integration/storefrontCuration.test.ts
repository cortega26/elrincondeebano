import { test, expect } from 'vitest';
import { createApp } from '../../src/server/app.ts';
import { writeFileSync, mkdirSync, rmSync, readFileSync, mkdirSync as mkdir } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { CREDENTIAL_HEADER } from '../../src/server/security/launchCredential.ts';
import type { FastifyInstance } from 'fastify';

function getCredential(app: FastifyInstance): string {
  const cred = (app as unknown as { launchCredential?: string }).launchCredential;
  return typeof cred === 'string' ? cred : '';
}

function credHeaders(app: FastifyInstance): Record<string, string> {
  return { [CREDENTIAL_HEADER]: getCredential(app) };
}

function createTempDir(): string {
  return resolve(tmpdir(), `cm-sf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
}

function setup(dir: string, bundles: unknown[] = []): void {
  const dataDir = resolve(dir, 'data');
  const astroDataDir = resolve(dir, 'astro-poc', 'src', 'data');
  mkdirSync(dataDir, { recursive: true });
  mkdirSync(astroDataDir, { recursive: true });

  writeFileSync(
    resolve(dataDir, 'product_data.json'),
    JSON.stringify({
      version: 'test',
      last_updated: '',
      rev: 1,
      products: [
        {
          id: 'p1',
          name: 'Café de Grano',
          description: '',
          price: 4500,
          discount: 0,
          stock: true,
          category: 'bebidas',
          image_path: '',
          image_avif_path: '',
          order: 0,
          is_archived: false,
          rev: 1,
          field_last_modified: {},
        },
        {
          id: 'p2',
          name: 'Agua Mineral',
          description: '',
          price: 1000,
          discount: 0,
          stock: true,
          category: 'bebidas',
          image_path: '',
          image_avif_path: '',
          order: 1,
          is_archived: false,
          rev: 1,
          field_last_modified: {},
        },
        {
          id: 'p3',
          name: 'Archivado',
          description: '',
          price: 100,
          discount: 0,
          stock: true,
          category: 'viejo',
          image_path: '',
          image_avif_path: '',
          order: 2,
          is_archived: true,
          rev: 1,
          field_last_modified: {},
        },
      ],
    })
  );
  writeFileSync(
    resolve(dataDir, 'category_registry.json'),
    JSON.stringify({ nav_groups: [], categories: [] })
  );
  writeFileSync(
    resolve(astroDataDir, 'storefront-experience.json'),
    JSON.stringify({
      trustBar: { highlights: [{ label: 'Envío', value: 'Gratis' }], statusItems: [] },
      home: {
        primaryCategories: [],
        secondaryCategories: [],
        fallbackQuickPicks: [],
        featuredStaples: [],
      },
      bundles,
      companionRules: [],
    })
  );
}

function validBundle(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'b1',
    title: 'Café y agua',
    description: 'Combo básico',
    items: [{ category: 'bebidas', name: 'Café de Grano' }],
    ...overrides,
  };
}

const trusted = {
  trustBar: { highlights: [{ label: 'Envío', value: 'Gratis' }], statusItems: [] },
  companionRules: [] as unknown[],
};

// ── invariants (step 1) ──────────────────────────────────────────────────────

test('empty, duplicate and dangling bundle records are rejected', async () => {
  const dir = createTempDir();
  setup(dir);
  try {
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();
    const ch = credHeaders(app);

    const empty = await app.inject({
      method: 'PUT',
      url: '/api/v1/storefront/bundles',
      headers: ch,
      payload: { bundles: [{ id: '', title: '', description: '', items: [] }] },
    });
    expect(empty.statusCode).toBe(422);

    const duplicate = await app.inject({
      method: 'PUT',
      url: '/api/v1/storefront/bundles',
      headers: ch,
      payload: {
        bundles: [
          validBundle(),
          validBundle({ items: [{ category: 'bebidas', name: 'Agua Mineral' }] }),
        ],
      },
    });
    expect(duplicate.statusCode).toBe(422);
    expect(duplicate.json<{ error: { message: string } }>().error.message).toContain('duplicado');

    const duplicateRefs = await app.inject({
      method: 'PUT',
      url: '/api/v1/storefront/bundles',
      headers: ch,
      payload: {
        bundles: [
          validBundle({
            items: [
              { category: 'bebidas', name: 'Café de Grano' },
              { category: 'bebidas', name: 'Café de Grano' },
            ],
          }),
        ],
      },
    });
    expect(duplicateRefs.statusCode).toBe(422);
    expect(duplicateRefs.json<{ error: { message: string } }>().error.message).toContain(
      'duplicada'
    );

    const dangling = await app.inject({
      method: 'PUT',
      url: '/api/v1/storefront/bundles',
      headers: ch,
      payload: { bundles: [validBundle({ items: [{ category: 'bebidas', name: 'No Existe' }] })] },
    });
    expect(dangling.statusCode).toBe(422);
    expect(dangling.json<{ error: { message: string } }>().error.message).toContain(
      'no encontrado'
    );

    const archived = await app.inject({
      method: 'PUT',
      url: '/api/v1/storefront/bundles',
      headers: ch,
      payload: { bundles: [validBundle({ items: [{ category: 'viejo', name: 'Archivado' }] })] },
    });
    expect(archived.statusCode).toBe(422);
    expect(archived.json<{ error: { message: string } }>().error.message).toContain('archivado');

    // Nothing was persisted.
    const after = JSON.parse(
      readFileSync(resolve(dir, 'astro-poc', 'src', 'data', 'storefront-experience.json'), 'utf8')
    );
    expect(after.bundles).toHaveLength(0);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('valid bundles persist atomically with the projection file', async () => {
  const dir = createTempDir();
  setup(dir);
  try {
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();
    const ch = credHeaders(app);

    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/storefront/bundles',
      headers: ch,
      payload: { bundles: [validBundle()] },
    });
    expect(res.statusCode).toBe(200);

    const experience = JSON.parse(
      readFileSync(resolve(dir, 'astro-poc', 'src', 'data', 'storefront-experience.json'), 'utf8')
    );
    expect(experience.bundles).toHaveLength(1);
    const projection = JSON.parse(
      readFileSync(resolve(dir, 'astro-poc', 'src', 'data', 'storefront-bundles.json'), 'utf8')
    );
    expect(projection).toHaveLength(1);
    expect(projection[0].id).toBe('b1');

    // Delete-last persists [] in the exact file Astro imports.
    const del = await app.inject({
      method: 'PUT',
      url: '/api/v1/storefront/bundles',
      headers: ch,
      payload: { bundles: [] },
    });
    expect(del.statusCode).toBe(200);
    expect(
      JSON.parse(
        readFileSync(resolve(dir, 'astro-poc', 'src', 'data', 'storefront-bundles.json'), 'utf8')
      )
    ).toEqual([]);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('featured edits reject bad references and preserve unrelated subtrees exactly', async () => {
  const dir = createTempDir();
  setup(dir, [validBundle()]);
  try {
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();
    const ch = credHeaders(app);

    const bad = await app.inject({
      method: 'PUT',
      url: '/api/v1/storefront/featured',
      headers: ch,
      payload: { featuredStaples: [{ category: 'bebidas', name: 'Ghost' }] },
    });
    expect(bad.statusCode).toBe(422);

    const ok = await app.inject({
      method: 'PUT',
      url: '/api/v1/storefront/featured',
      headers: ch,
      payload: {
        featuredStaples: [{ category: 'bebidas', name: 'Café de Grano' }],
        primaryCategories: ['bebidas'],
      },
    });
    expect(ok.statusCode).toBe(200);

    const experience = JSON.parse(
      readFileSync(resolve(dir, 'astro-poc', 'src', 'data', 'storefront-experience.json'), 'utf8')
    );
    expect(experience.home.featuredStaples).toEqual([
      { category: 'bebidas', name: 'Café de Grano' },
    ]);
    expect(experience.home.primaryCategories).toEqual(['bebidas']);
    // Unrelated subtrees byte-semantically unchanged.
    expect(experience.trustBar).toEqual(trusted.trustBar);
    expect(experience.companionRules).toEqual(trusted.companionRules);
    expect(experience.bundles).toHaveLength(1);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── atomic dual-write (step 2) ───────────────────────────────────────────────

test('injected second-file failure rolls back BOTH files', async () => {
  const dir = createTempDir();
  setup(dir, [validBundle()]);
  try {
    const app = createApp({ repoRoot: dir, enableWrites: true, logger: false });
    await app.ready();
    const ch = credHeaders(app);

    // Establish both files with a valid write first.
    const seed = await app.inject({
      method: 'PUT',
      url: '/api/v1/storefront/bundles',
      headers: ch,
      payload: { bundles: [validBundle()] },
    });
    expect(seed.statusCode).toBe(200);

    const beforeExperience = readFileSync(
      resolve(dir, 'astro-poc', 'src', 'data', 'storefront-experience.json'),
      'utf8'
    );
    const beforeProjection = readFileSync(
      resolve(dir, 'astro-poc', 'src', 'data', 'storefront-bundles.json'),
      'utf8'
    );

    // Break the bundles projection write: a directory at the .tmp path makes
    // writeFileSync fail after the experience file was already written.
    mkdir(resolve(dir, 'astro-poc', 'src', 'data', 'storefront-bundles.json.tmp'));

    const res = await app.inject({
      method: 'PUT',
      url: '/api/v1/storefront/bundles',
      headers: ch,
      payload: { bundles: [validBundle({ id: 'b2', title: 'Otro' })] },
    });
    expect(res.statusCode).toBe(500);

    // Both files restored to their prior content.
    const afterExperience = readFileSync(
      resolve(dir, 'astro-poc', 'src', 'data', 'storefront-experience.json'),
      'utf8'
    );
    expect(afterExperience).toBe(beforeExperience);

    rmSync(resolve(dir, 'astro-poc', 'src', 'data', 'storefront-bundles.json.tmp'), {
      recursive: true,
      force: true,
    });
    expect(
      readFileSync(resolve(dir, 'astro-poc', 'src', 'data', 'storefront-bundles.json'), 'utf8')
    ).toBe(beforeProjection);

    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
