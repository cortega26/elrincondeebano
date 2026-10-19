import { test, expect } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createApp } from '../../src/server/app.ts';
import { buildOpenApi } from '../../src/server/openapi.ts';

// Plan 252: routes ↔ document completeness guard — every route the app
// registers under /api/v1 must be declared in the generated OpenAPI
// document, so a new route cannot ship without its declaration. Route
// source: `app.printRoutes({ commonPrefix: false })` on a temp-repo
// `createApp` (what Fastify actually serves), not the ROUTE_POLICY
// classification table.

const METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);

// Parses the radix tree printed by Fastify. Depth is the tree-prefix width
// (4 chars per level); a child segment is concatenated verbatim to its
// parent, so `/prune` + `-preview` and `/export` + `.csv` reconstruct.
function parsePrintRoutes(output: string): Array<{ method: string; path: string }> {
  const routes: Array<{ method: string; path: string }> = [];
  const stack: string[] = [];
  for (const line of output.split('\n')) {
    const match = line.match(/^((?:│ {3}| {4})*)(?:├── |└── )(.+)$/);
    if (!match) continue;
    const depth = match[1].length / 4;
    const text = match[2];
    const methodsMatch = text.match(/ \(([A-Z, ]+)\)$/);
    const segment = (methodsMatch ? text.slice(0, methodsMatch.index) : text).trim();
    stack[depth] = (depth === 0 ? '' : (stack[depth - 1] ?? '')) + segment;
    stack.length = depth + 1;
    if (!methodsMatch) continue;
    for (const method of methodsMatch[1].split(',').map((part) => part.trim())) {
      if (METHODS.has(method)) routes.push({ method, path: stack[depth] });
    }
  }
  return routes;
}

// Fastify prints merged param alternatives (`/:key|:id|:categoryId`); the doc
// uses one OpenAPI-style name per slot.
function toOpenApiPath(routePath: string): string {
  return routePath.replace(/:([A-Za-z]+)(?:\|:[A-Za-z]+)*/g, '{$1}');
}

// Comparison normalizes every param label away — the contract is the route
// shape, not the param name (same rule as openapi.test.ts).
function normalizeParamNames(path: string): string {
  return path.replace(/\{[^}]+\}/g, '{}');
}

test('every registered /api/v1 route is declared in the OpenAPI document', async () => {
  // Pin the preview-build flag off: with PREVIEW_BUILD_ENABLED=1 the app also
  // registers GET /api/v1/preview and GET /api/v1/preview/* — static preview
  // assets served from the preview dist root, not part of the JSON API
  // contract — and printRoutes renders the wildcard child as `preview*`.
  delete process.env.PREVIEW_BUILD_ENABLED;

  const dir = resolve(
    tmpdir(),
    `cm-route-doc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  );
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

  const app = createApp({ repoRoot: dir, logger: false });
  await app.ready();
  let routes: Array<{ method: string; path: string }>;
  try {
    routes = parsePrintRoutes(app.printRoutes({ commonPrefix: false }));
  } finally {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  }

  const doc = buildOpenApi();
  const declared = new Set<string>();
  for (const [path, methods] of Object.entries(doc.paths ?? {})) {
    for (const method of Object.keys(methods as object)) {
      declared.add(`${method.toUpperCase()} ${normalizeParamNames(path)}`);
    }
  }

  // Explicit allowlist — comment per entry. Keep it strict: any other route
  // must be declared in src/server/openapi.ts in the same change.
  const allowlist = new Set<string>([
    // Liveness probe: answers before the document is available, not API surface.
    'GET /api/v1/health',
    // The document endpoints themselves cannot be described by the document
    // (GET /api/v1/openapi.csv joins here if it is ever registered).
    'GET /api/v1/openapi.json',
  ]);

  const pairs = [
    ...new Set(
      routes
        .filter((route) => route.path.startsWith('/api/v1'))
        .map((route) => `${route.method} ${normalizeParamNames(toOpenApiPath(route.path))}`)
    ),
  ].sort();

  const missing = pairs.filter((pair) => !declared.has(pair) && !allowlist.has(pair));

  expect(
    missing,
    `routes registered but not declared in the OpenAPI document: ${missing.join(', ')}`
  ).toEqual([]);
});
