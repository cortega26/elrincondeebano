import { test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildOpenApi } from '../../src/server/openapi.ts';

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
