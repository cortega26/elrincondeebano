// Plan 214: dev-only OpenAPI type codegen (single source stays the zod doc).
//
// Tool choice (tradeoff record): openapi-typescript is NOT installed as a
// dependency — every release peers typescript@^5.x, which breaks `npm ci`
// (ERESOLVE) on this repo's TS6/TS7 tree (verified 2026-09-15). Instead the
// pinned registry version below runs via npx: immutable, reproducible
// output, zero install-graph impact. DEPENDENCY_POLICY needs no RFC for
// this (waves govern updates of existing deps; rule 6's tradeoff note is
// this comment). If the tool ever ships a TS6/7-compatible peer range,
// prefer a real devDependency pin and delete this note.
//
// Usage: npm run codegen:openapi  (admin/content-manager workspace)
// Output: src/web/api/__generated__/openapi.d.ts (COMMITTED snapshot —
// regen, don't hand-edit; the contract test fails CI on drift).
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const OPENAPI_TYPESCRIPT_VERSION = '7.13.0';

const here = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(here, '..');
const outFile = resolve(workspaceRoot, 'src', 'web', 'api', '__generated__', 'openapi.d.ts');

const { buildOpenApi } = await import('../src/server/openapi.ts');

const tmp = mkdtempSync(resolve(tmpdir(), 'openapi-codegen-'));
try {
  const docPath = resolve(tmp, 'openapi.json');
  writeFileSync(docPath, JSON.stringify(buildOpenApi()));
  execFileSync(
    'npx',
    ['--yes', `openapi-typescript@${OPENAPI_TYPESCRIPT_VERSION}`, docPath, '-o', outFile],
    { stdio: 'inherit' }
  );
  // The generator emits no header — prepend the do-not-edit notice so the
  // freshness contract (regen, never hand-edit) survives regeneration.
  const generated = readFileSync(outFile, 'utf8');
  writeFileSync(
    outFile,
    `/**\n * DO NOT EDIT — generated from the single-source zod doc.\n * Regen: npm run codegen:openapi (admin/content-manager workspace).\n * Stale snapshots fail CI via test/contract/openapi.test.ts.\n */\n${generated}`
  );
  console.log(`Generated ${outFile} (openapi-typescript@${OPENAPI_TYPESCRIPT_VERSION})`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
