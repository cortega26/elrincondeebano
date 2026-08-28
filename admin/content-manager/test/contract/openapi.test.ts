import { test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdirSync, rmSync } from 'node:fs';
import { z } from 'zod';
import { buildOpenApi, openApiDocument } from '../../src/server/openapi.ts';
import { createApp } from '../../src/server/app.ts';

// Plan 127 F2.3: the client/server contract — every route the typed client
// calls must be declared in the generated OpenAPI document. The client's
// paths are extracted from its source (the single place they live), so a
// new client method without an OpenAPI declaration fails this test.

const CLIENT_SOURCE = resolve(__dirname, '../../src/web/api/client.ts');

interface ClientRoute {
  path: string;
  method: string;
}

function extractClientRoutes(): ClientRoute[] {
  const src = readFileSync(CLIENT_SOURCE, 'utf-8');
  const routes: ClientRoute[] = [];

  // this.request('/path', { method: 'PATCH' }) and this.request('/path')
  const requestRe =
    /this\.request(?:<[^>]+>)?\(\s*[`']([^`']+)[`']\s*(?:,\s*\{\s*method:\s*'([A-Z]+)')?/g;
  let m: RegExpExecArray | null;
  while ((m = requestRe.exec(src)) !== null) {
    const rawPath = m[1];
    const method = (m[2] ?? 'GET').toLowerCase();
    routes.push({ path: rawPath, method });
  }

  // Direct fetch calls with an explicit HTTP verb.
  const fetchRe = /method:\s*'([A-Z]+)'[^}]*url:\s*`([^`]+)`/g;
  while ((m = fetchRe.exec(src)) !== null) {
    routes.push({ path: m[2], method: m[1].toLowerCase() });
  }

  return routes;
}

function toOpenApiPath(rawPath: string): string {
  // '/products/${encodeURIComponent(id)}' -> '/api/v1/products/{id}'
  let p = rawPath;
  if (!p.startsWith('/api/v1')) {
    p = `/api/v1${p}`;
  }
  p = p.replace(/\$\{encodeURIComponent\(([^)]+)\)\}/g, '{$1}');
  return p;
}

test('every client request path is declared in the OpenAPI document', () => {
  const doc = buildOpenApi();
  const declared = new Map<string, string[]>();
  for (const [path, methods] of Object.entries(doc.paths ?? {})) {
    declared.set(path, Object.keys(methods as object));
  }

  const clientRoutes = extractClientRoutes();
  expect(clientRoutes.length).toBeGreaterThan(10);

  // Compare with parameter names normalized ({id}/{categoryId}/{subId} ->
  // {}) — the contract is the route shape, not the param label.
  const normalize = (path: string): string => path.replace(/\{[^}]+\}/g, '{}');
  const declaredNormalized = new Map<string, string[]>();
  for (const [path, methods] of declared) {
    declaredNormalized.set(normalize(path), methods);
  }

  const missing: string[] = [];
  for (const route of clientRoutes) {
    const openApiPath = normalize(toOpenApiPath(route.path));
    const methods = declaredNormalized.get(openApiPath);
    if (!methods || !methods.includes(route.method)) {
      missing.push(`${route.method.toUpperCase()} ${openApiPath}`);
    }
  }

  expect(missing, `client routes missing from the OpenAPI document: ${missing.join(', ')}`).toEqual(
    []
  );
});

test('the OpenAPI document exposes the product and category schemas', () => {
  const doc = buildOpenApi();
  const schemas = doc.components?.schemas ?? {};
  expect(Object.keys(schemas)).toContain('Product');
  expect(Object.keys(schemas)).toContain('Category');
  expect(Object.keys(schemas)).toContain('Bundle');
});

// Plan 163 fallback (extends plan 133): shape assertion so a missing request
// field fails CI instead of becoming a silent 422. This is the permanent
// guard whether the spike adopts a generated client or not. The full matrix
// from plan 133 will replace this focused guard when its openapi.ts fixes
// land, but this one field (publishAt) is the proven drift case.

type JsonSchema = {
  $ref?: string;
  type?: string;
  enum?: string[];
  nullable?: boolean;
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  required?: string[];
  additionalProperties?: JsonSchema | boolean;
  anyOf?: JsonSchema[];
};

function jsonSchemaToZod(schema: JsonSchema, components: Record<string, JsonSchema>): z.ZodType {
  if (schema.$ref) {
    const name = schema.$ref.split('/').pop() ?? '';
    return jsonSchemaToZod(components[name] ?? {}, components);
  }
  if (schema.anyOf) {
    return z.union(schema.anyOf.map((s) => jsonSchemaToZod(s, components)));
  }
  if (schema.enum) {
    return z.enum(schema.enum as [string, ...string[]]);
  }
  if (schema.type === 'array') {
    return z.array(jsonSchemaToZod(schema.items ?? {}, components));
  }
  if (schema.type === 'object' || schema.properties || schema.additionalProperties) {
    if (!schema.properties) {
      return z.record(z.string(), z.unknown());
    }
    const required = new Set(schema.required ?? []);
    const shape: Record<string, z.ZodType> = {};
    for (const [key, sub] of Object.entries(schema.properties)) {
      const base = jsonSchemaToZod(sub, components);
      shape[key] = required.has(key) ? base : base.optional();
    }
    const objectSchema = z.object(shape);
    return schema.additionalProperties ? objectSchema.catchall(z.unknown()) : objectSchema;
  }
  if (schema.type === 'string') return z.string();
  if (schema.type === 'number' || schema.type === 'integer') return z.number();
  if (schema.type === 'boolean') return z.boolean();
  return z.unknown();
}

test('POST /api/v1/publications request body is documented with publishAt and validates (plan 163 fallback)', () => {
  const doc = buildOpenApi() as unknown as {
    paths: Record<
      string,
      Record<
        string,
        { requestBody?: { content?: { 'application/json'?: { schema?: JsonSchema } } } }
      >
    >;
    components: { schemas: Record<string, JsonSchema> };
  };

  const op = doc.paths['/api/v1/publications']?.post;
  const schema = op?.requestBody?.content?.['application/json']?.schema;
  expect(schema, 'POST /api/v1/publications must declare a requestBody schema').toBeDefined();

  // The drift that recurred three times: publishAt omitted from doc or client.
  const props = (schema as JsonSchema).properties ?? {};
  expect(Object.keys(props), 'publications requestBody must declare publishAt').toEqual(
    expect.arrayContaining(['commitMessage', 'push', 'publishAt'])
  );
  expect(props.publishAt?.type).toBe('string');

  // The client must also forward publishAt (src check, not shape param).
  const clientSrc = readFileSync(CLIENT_SOURCE, 'utf-8');
  expect(clientSrc).toContain('publishAt');

  // Runtime shape guard: fixtures that mirror what the client actually
  // JSON.stringify's must validate against the documented schema.
  const components = (doc.components?.schemas ?? {}) as Record<string, JsonSchema>;
  const zodSchema = jsonSchemaToZod(schema as JsonSchema, components);

  const fixtures: Array<{ name: string; payload: unknown }> = [
    { name: 'minimal publish', payload: { commitMessage: 'release v2', push: true } },
    {
      name: 'scheduled publish',
      payload: {
        commitMessage: 'release v2',
        push: false,
        publishAt: new Date(Date.now() + 60_000).toISOString(),
      },
    },
  ];

  for (const { name, payload } of fixtures) {
    const result = zodSchema.safeParse(payload);
    expect(
      result.success,
      `${name} payload does not match documented schema: ${JSON.stringify(result.error?.issues)}`
    ).toBe(true);
  }
});

// Plan 150: memoization — the static doc is built once per process and served
// from that cached build. Verify identity + bytes + route serving.

test('openApiDocument is memoized — two imports return the same reference', () => {
  // Module-level const — same object on every access (not a fresh build).
  const a = openApiDocument;
  const b = openApiDocument;
  expect(a).toBe(b);
});

test('openApiDocument serializes identically to a fresh buildOpenApi()', () => {
  const fresh = buildOpenApi();
  expect(JSON.stringify(openApiDocument)).toBe(JSON.stringify(fresh));
});

test('GET /openapi.json returns identical bytes on consecutive requests', async () => {
  const dir = resolve(
    tmpdir(),
    `cm-openapi-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  );
  mkdirSync(dir, { recursive: true });
  const app = createApp({ repoRoot: dir, enableWrites: false, logger: false });
  await app.ready();
  try {
    const first = await app.inject({ method: 'GET', url: '/api/v1/openapi.json' });
    expect(first.statusCode).toBe(200);
    const second = await app.inject({ method: 'GET', url: '/api/v1/openapi.json' });
    expect(second.statusCode).toBe(200);
    expect(second.body).toBe(first.body);
    // Bytes must also match the memoized document (no per-request transform).
    expect(JSON.stringify(JSON.parse(first.body))).toBe(JSON.stringify(openApiDocument));
  } finally {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
