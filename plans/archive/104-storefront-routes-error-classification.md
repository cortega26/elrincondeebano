# 104 — Classify storefront PUT errors correctly (stop 400-masquerading 500s)

- **Source**: Auditoría 9, B7 (CORRECTNESS-07)
- **Status**: TODO · **Priority**: P2 · **Effort**: S
- **Stamped against**: `ccb921f`

## Problem

`admin/content-manager/src/server/routes/storefront.ts` wraps the whole
handler bodies of the bundles and featured PUT routes in a catch that
converts **everything** into a 400:

```ts
// storefront.ts:72-74 and 121-123
catch (err) {
  throw new HttpError(400, 'BAD_REQUEST', sanitizeUserMessage((err as Error).message));
}
```

Server-side failures — `StorefrontRepository.load()` throwing on unreadable/
invalid JSON (`repositories/storefrontRepository.ts:45-64`),
`ProductRepository.loadCatalog()` schema failures, unexpected exceptions in
`validateStorefrontCuration` — are all reported as client validation errors.
The central error handler (`app.ts:396-409`) would otherwise classify these
as 500 with details logged server-side.

## Scope

**In**: `admin/content-manager/src/server/routes/storefront.ts`, the
storefront route tests (`test/integration/` — find the storefront PUT tests).

**Out**: the repository, the validation module.

## Steps

1. Change the catch to rethrow only client-validation errors as 400 (e.g.
   `err instanceof ZodError`, or the codebase's HttpError class if it has a
   distinct validation marker), and let everything else propagate to the
   central error handler for a correct 500 + server-side log.
2. Confirm the two routes are the only places with this blanket pattern
   (grep `HttpError(400` across `routes/` — fix all instances in this
   file; leave unrelated files unless the same one-line pattern appears
   there, in which case list them in the plan review).
3. Repo convention: check how `changes.ts`/`catalog.ts` classify validation
   errors and mirror that (consistent 400 vs 500 semantics across routes).

## Tests

- Integration: corrupt the storefront experience file (or mock the
  repository to throw), PUT bundles → assert the response is 500 (or the
  central handler's shape), not 400; a genuinely malformed payload still
  yields 400.
- Run: `npm run admin:test` green.

## Done criteria

- [ ] Internal errors from the storefront PUT routes surface as 5xx with
      server-side logging, not 400.
- [ ] Malformed payloads still return 400 (regression test).
- [ ] `npm run admin:test` + `npm run lint` green.

## Maintenance

This file is also the one with no `command_id` guard (see the audit note) —
when batch-undo (plan 121) or any concurrency work touches it, keep the
error-classification boundary intact.

## Rollback

`git revert <sha>`.
