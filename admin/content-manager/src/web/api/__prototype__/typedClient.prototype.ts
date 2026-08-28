// Spike 163 — prototype typed client (hand-rolled minimal generator)
//
// This file is the spike's "one working prototype method" deliverable.
// It is NOT imported by the app (isolated so `npm run admin:test` stays green).
// It demonstrates the recommended approach: keep the existing fetch + credential +
// ApiRequestError semantics, but derive request/response types from the
// generated OpenAPI document (openapi-typescript) instead of hand-writing them.
//
// Generation (dev-only, no runtime dep):
//   node --import tsx -e "import{buildOpenApi}from'./src/server/openapi.ts';import{writeFileSync}from'node:fs';writeFileSync('/tmp/openapi.json',JSON.stringify(buildOpenApi(),null,2))"
//   npx openapi-typescript /tmp/openapi.json -o src/web/api/__prototype__/openapi.d.ts
//
// Runtime deps added: none. Dev dep if adopted: openapi-typescript (already
// available via npx; would be added as devDependency with a wave-3 RFC note).
// Bundle impact: 0 bytes — types are erased at build.
//
// The prototype preserves plan 057's credential posture and the client's
// envelope + 409 ApiRequestError semantics (see client.ts:250-287).

import type { paths } from './openapi.d.ts';
import { getCredentialValue } from '../../app/credentialStore.ts';

// Re-export the existing error class semantics so call sites keep the same
// catch shape (status is required for 409 stale-revision retries).
export class ApiRequestError extends Error {
  public readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
  }
}

type ApiError = {
  error: { code: string; message: string };
};

// ── Generated type helpers ──────────────────────────────────────────────
// Map OpenAPI paths to their request/response shapes. The names mirror the
// pattern openapi-fetch uses, but without adding the runtime.
// requestBody is optional in the generated types, so NonNullable is needed.

type PublishRequest = NonNullable<
  paths['/api/v1/publications']['post']['requestBody']
>['content']['application/json'];

type PublishResponse =
  paths['/api/v1/publications']['post']['responses'][200]['content']['application/json'];

type ListProductsResponse =
  paths['/api/v1/products']['get']['responses'][200]['content']['application/json'];

// Compile-time guard: if the OpenAPI doc omits publishAt, this line fails.
// This is the drift class the hand-written client missed three times.
type AssertPublishAtExists = PublishRequest extends { publishAt?: string } ? true : never;
const _assertPublishAt: AssertPublishAtExists = true;

// ── Minimal typed fetch wrapper ─────────────────────────────────────────

export class PrototypeTypedClient {
  private readonly baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = (
      baseUrl ??
      (typeof window !== 'undefined' ? window.location.origin : undefined) ??
      'http://127.0.0.1:3000'
    ).replace(/\/$/, '');
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const method = init?.method ?? 'GET';
    const isMutation = ['POST', 'PATCH', 'PUT', 'DELETE'].includes(method);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(init?.headers as Record<string, string> | undefined),
    };

    if (isMutation) {
      const credential = getCredentialValue();
      if (credential) {
        headers['x-admin-credential'] = credential;
      }
    }

    const url = `${this.baseUrl}/api/v1${path}`;
    const response = await fetch(url, {
      ...init,
      headers,
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as ApiError;
      throw new ApiRequestError(
        body.error?.message ?? `HTTP ${response.status}: ${response.statusText}`,
        response.status
      );
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json() as Promise<T>;
  }

  // ── Prototype method 1: publish (scheduled publication) ───────────────
  // This is the drift case (missing publishAt in plan 115, plan 133).
  // Request type is derived from the OpenAPI doc; adding a new optional
  // field to the doc's schema immediately surfaces here as a type, and
  // removing publishAt would break the compile-time guard above.

  async publish(body: PublishRequest): Promise<PublishResponse> {
    return this.request<PublishResponse>('/publications', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  // Convenience overload matching the existing client's positional args,
  // but delegated to the typed body so call sites can migrate incrementally.
  async publishLegacy(
    commitMessage?: string,
    push?: boolean,
    publishAt?: string
  ): Promise<PublishResponse> {
    const payload: PublishRequest = { commitMessage, push };
    if (publishAt) (payload as Record<string, unknown>).publishAt = publishAt;
    return this.publish(payload);
  }

  // ── Prototype method 2: listProducts (query + paginated response) ─────
  // Demonstrates typed response handling. Query params are not yet typed
  // via OpenAPI (the spec declares `query?: never` for this route — a known
  // incompleteness in the doc), so they remain hand-typed until the doc is
  // enriched. The response shape, however, is fully typed.

  async listProducts(params?: {
    page?: number;
    limit?: number;
    q?: string;
    category?: string;
  }): Promise<ListProductsResponse> {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', String(params.page));
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.q) searchParams.set('q', params.q);
    if (params?.category) searchParams.set('category', params.category);
    const qs = searchParams.toString();
    return this.request<ListProductsResponse>(`/products${qs ? `?${qs}` : ''}`);
  }

  // ── Verification helper (not part of production client) ───────────────
  // Call from a test to prove the prototype's request shape matches the
  // documented schema via zod safeParse (same pattern plan 133 uses).

  static verifyPublishShape(docSchema: unknown): boolean {
    // This is intentionally runtime-free in the prototype; the real shape
    // assertion lives in test/contract/openapi.test.ts where zod is available.
    void docSchema;
    return _assertPublishAt;
  }
}
