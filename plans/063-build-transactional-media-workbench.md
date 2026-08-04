# Plan 063: Build a transactional media and generated-asset workbench

> **Executor instructions**: Never write uploaded bytes directly to canonical assets.
> Stage, inspect, transform, validate, and atomically promote them through change sets.
> Use only allowlisted repository tools and disposable fixture directories.
>
> **Drift check (run first)**:
> `git diff --stat 30dbab7..HEAD -- admin/content-manager/src/server/routes/media.ts admin/content-manager/src/server/repositories/mediaRepository.ts admin/content-manager/src/web/app/routes/MediaPage.tsx admin/product_manager/ui/product_form.py admin/product_manager/image_fallbacks.py admin/product_manager/category_gui.py tools`

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: 057, 058, 062
- **Category**: migration / direction / security
- **Planned at**: commit `30dbab7`, 2026-07-16
- **Findings covered**: F12
- **Direction covered**: D01 media and generated-asset workbench

## Why this matters

The TS media endpoints acknowledge conversion/generation without doing work, intents are
not durable, upload writes directly to canonical files, and the React page is inventory-
only. Python remains required for ingestion, resize/convert, AVIF fallback, and category
OG lifecycle. A transactional workbench is the safest way to migrate these capabilities.

## Current state

- `routes/media.ts:27-73` creates response-only intents and discards any ID successfully.
- `routes/media.ts:75-99` returns `acknowledged` for AVIF conversion/generation.
- `routes/media.ts:101-155` trusts declared MIME, base64-decodes, and writes directly to
  the resolved canonical path.
- `MediaPage.tsx:15-148` only lists/filter inventory.
- `admin/product_manager/ui/product_form.py:290-430` copies, optionally resizes/converts,
  imports AVIF, and sets product paths.
- `admin/product_manager/image_fallbacks.py:71-127` builds non-AVIF fallbacks;
  `category_gui.py:1048-1079` generates/deletes category OG assets.
- Root scripts already expose canonical AVIF, variant, and OG generators; invoke only
  allowlisted entry points with argument arrays and observable job state.

## Commands you will need

| Purpose    | Command                                                                | Expected on success      |
| ---------- | ---------------------------------------------------------------------- | ------------------------ |
| Focused    | `npm -w admin/content-manager run test -- media`                       | all pass                 |
| Browser    | `npm -w admin/content-manager run test:e2e -- --grep "media"`          | workflows pass           |
| Assets     | `npm run guardrails:assets`                                            | exit 0 on fixture result |
| Manager    | `npm run admin:typecheck && npm run admin:test && npm run admin:build` | exit 0                   |
| Regression | `npm run validate`                                                     | exit 0                   |

## Scope

**In scope**:

- durable media-intent/job schemas, repository, routes, and runner integration
- staged upload with content sniffing, limits, safe names/paths, and atomic promotion
- allowlisted AVIF/fallback/variant/category-OG operations
- product/category reference updates inside Plan 062 change sets
- Media workbench UI, cleanup/recovery, and fixture tests

**Out of scope**:

- Arbitrary shell commands or general file manager functionality.
- Real production asset transformation during tests.
- New image-generation aesthetics or AI-generated catalog media.

## Git workflow

- Branch: `feat/063-transactional-media-workbench`
- Commit by upload, jobs, and UI slices.

## Steps

### Step 1: Define durable media intents and staging

Persist versioned intents with source, target, product/category reference, expected
outputs, hashes, status, progress, errors, timestamps, and change-set ID. Stage beneath
a manager-owned temporary root with canonical-path containment and restart recovery.

**Verify**: restart, corrupt intent, traversal, symlink, collision, duplicate command,
cancel, and orphan-staging tests fail safely.

### Step 2: Harden upload inspection

Stream or bounded-decode uploads, verify magic bytes and decoded image format/dimensions,
enforce extension/MIME agreement and size/pixel limits, and generate safe target names.
Never promote on validation failure.

**Verify**: spoofed MIME, polyglot/invalid image, decompression-size limit, ENOSPC,
traversal, and overwrite-without-confirmation tests leave canonical assets unchanged.

### Step 3: Execute allowlisted transformations

Wrap canonical repository tools in typed jobs with fixed commands/arguments, progress,
timeouts, cancellation, and captured sanitized diagnostics. Implement fallback/AVIF,
variants, and category OG create/update/delete parity.

**Verify**: golden fixture outputs exist with expected format/hash policy; tool failure,
timeout, cancel, and restart preserve prior assets and actionable job state.

### Step 4: Atomically apply content plus assets

Review media outputs in the owning change set. On apply, validate all outputs/references,
promote assets and content with a recovery journal, and roll back the complete unit on
any failure. Discard removes staging only.

**Verify**: failure injection at every promote/write boundary proves product/category
JSON and asset paths never split.

### Step 5: Build the media workbench

Add upload, target selection, preview, derivatives, progress, cancel, retry, discard,
missing/orphan repair, category OG operations, and recovery guidance. Connect product
form media pickers only to applied or staged-intent references.

**Verify**: Playwright covers upload → preview → convert/generate → review → apply,
cancel, failure, reload recovery, and keyboard-only interaction.

## Test plan

- Extend media security/upload tests with real tiny fixture headers and failure injection.
- Port Python fallback/category-OG cases as golden fixtures.
- Add repository/job/change-set integration and browser suites.
- Assert no test modifies `assets/` or `astro-poc/public/` outside temporary roots.

## Done criteria

- [ ] Media intents/jobs survive restart and expose truthful status.
- [ ] Upload content is inspected, bounded, staged, and contained.
- [ ] AVIF/fallback/variant/category-OG operations produce validated outputs.
- [ ] Content and assets apply or roll back atomically.
- [ ] UI completes Python-equivalent media workflows without filesystem intervention.
- [ ] Focused, E2E, asset, manager, and root gates pass.

## STOP conditions

- A canonical tool cannot target a disposable/staging root.
- Output determinism or ownership cannot be established.
- Atomic rollback across JSON and assets cannot be proven under injected failure.
- A proposed command accepts uncontrolled browser arguments.

## Maintenance notes

New generated asset types require an allowlisted job, deterministic ownership manifest,
validation, discard/recovery, and publication integration before UI exposure.
