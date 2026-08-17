# 138 — Media workbench hardening: batch-discard cleanup + raster-only targets

- **Source**: Auditoría 10, CORR-11 + SEC-05 · **Status**: TODO · **Priority**: P2 · **Effort**: S-M
- **Stamped against**: `ee20b0f6` (2026-08-17) · **Drift check**: `git diff --stat ee20b0f6..HEAD -- admin/content-manager/src/server/routes/media.ts admin/content-manager/src/server/services/mediaJobs.ts admin/content-manager/src/shared/schemas/media.ts`

## Problem

Two gaps in the plan-127 F2.4 media batch surface:

**1. Batch discard orphans generated outputs.** The batch branch (`media.ts:403-421`) deletes only `intent.staged_file`; the single-route `DELETE /media/intents/:id` additionally cleans `intent.outputs` and `intent.source_path` (`media.ts:442-461`):

```ts
for (const output of intent.outputs) {
  if (isContainedWithin(intents.stagingRoot, output) && existsSync(output)) {
    try {
      unlinkSync(output);
    } catch {
      /* Best-effort cleanup */
    }
  }
}
```

A succeeded avif/variant intent has its outputs in `.media-staging` (`mediaJobs.ts:59,83`) — batch-discarding it leaks those files until manual cleanup.

**2. Raster jobs can target `.svg` paths (content-type confusion).** `.svg` is in `VALID_IMAGE_EXTENSIONS` (`shared/schemas/media.ts:61-69`); for a `variant` intent, `canonicalTargetFor` (`media.ts:609-617`) rewrites `foo.svg` → `foo-480.svg` while the job output is a sharp-generated WebP buffer named `variant-480.webp` (`mediaJobs.ts:83`); `apply` renames the buffer onto `foo-480.svg`. The admin static handler serves `.svg` as `image/svg+xml`. Uploads cannot carry real SVG today (magic-byte sniffing at `media.ts:19-40` rejects it), so exploitability is low — but the naming/content mismatch is a latent MIME-confusion that also yields broken images for `.svg`-targeted jobs.

## Scope

**In**: `admin/content-manager/src/server/routes/media.ts` (batch discard; intent-creation target validation), `admin/content-manager/src/shared/schemas/media.ts` (if a validation helper is needed), tests `test/contract/media.test.ts` + `test/integration/mediaWorkbench.test.ts`.

**Out**: `mediaJobs.ts` output formats, apply semantics for raster targets, the OG job type.

## Steps

1. Extract the output+source cleanup loop from the single DELETE route into a shared helper (module-level function in `media.ts` or the intents repository) and call it from both the single route and the batch discard branch.
2. Validate `target_path` at intent creation: for `variant`/`avif` (raster) job types, reject targets whose extension is not a raster type (accept the existing raster extensions incl. webp/jpg/png/avif; reject `.svg`). Return `422 VALIDATION_ERROR` with a message naming the extension conflict.
3. Leave OG intents' handling untouched (they are a different job class; verify they are not affected by the extension rule).

## Tests

- `mediaWorkbench.test.ts` pattern: (a) run an avif/variant intent to success, batch-discard it → assert no files remain under `.media-staging` for that intent (outputs AND staged_file); (b) create a variant intent with `target_path` ending `.svg` → 422; (c) existing single-route discard tests still pass unchanged.
- Run: `npm run admin:test` green; `npm run admin:typecheck`; `npm run lint` green.

## Done criteria

- [ ] Batch discard removes outputs + source + staged file (asserted).
- [ ] Raster job targeting `.svg` is rejected at creation (asserted).
- [ ] `npm run admin:test` green.

## Maintenance

If `.svg` uploads are ever allowed, this plan's extension rule must be revisited (SVG content must never reach a raster job target). A reviewer should confirm the OG intent tests still pass — OG is the only job type with non-raster output.

## Rollback

`git revert <sha>`.

## STOP conditions

- If any fixture or e2e test creates raster intents with `.svg` targets, stop and report — the plan's assumption that none exist is false.
