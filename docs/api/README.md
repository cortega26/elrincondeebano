# Admin API — contract pointer (plan 208)

> Pointer, not copy: the machine-verified contract is the generated OpenAPI
> document. This page exists so the contract is discoverable from `docs/api/`
> (which otherwise covers only utils). Do not duplicate endpoint docs here —
> they rot; link the source instead.

- **Live document:** `GET /api/v1/openapi.json` (served read-only by the
  admin server, `admin/content-manager/src/server/openapi.ts`).
- **Source:** `admin/content-manager/src/server/openapi.ts` (`buildOpenApi`,
  generated from the shared zod schemas — plan 127 F2.3).
- **Contract test:** `admin/content-manager/test/contract/openapi.test.ts`
  (every client-called route must be declared; plan 133, extended plan 197).
- **Regenerate + verify locally:**
  `node --import tsx -e "import('./admin/content-manager/src/server/openapi.ts').then(m => console.log(Object.keys(m.buildOpenApi().paths).length + ' paths'))"`
  plus `npm run admin:test -- test/contract/openapi.test.ts`.

The admin API is loopback-local by design — no published-API program exists
beyond this pointer (that would be a separate maintainer decision).
