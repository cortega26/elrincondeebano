// E2E harness for the import workflow (plan 060 step 3): serves a COPY of a
// small fixture catalog from a temp repo so browser tests never touch the
// real catalog. Env: ADMIN_CREDENTIAL=e2e-import (the spec types this value
// into the credential prompt), PORT=3101.
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';

const PORT = Number(process.env.PORT) || 3101;
const fixtureDir = resolve(process.cwd(), 'test', 'fixtures', 'import-e2e-repo');
const webDist = resolve(process.cwd(), 'dist', 'web');
const tmpRepo = `${tmpdir()}/cm-import-e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

mkdirSync(tmpRepo, { recursive: true });
cpSync(fixtureDir, tmpRepo, { recursive: true });
// The SPA is served from <repoRoot>/admin/content-manager/dist/web (app.ts) —
// copy the built web app so /import and friends render in the temp repo.
cpSync(webDist, resolve(tmpRepo, 'admin', 'content-manager', 'dist', 'web'), {
  recursive: true,
});

const server = spawn('node', ['--import', 'tsx', 'src/server/start.ts'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    REPO_ROOT: tmpRepo,
    ADMIN_MODE: 'operator',
    ADMIN_CREDENTIAL: 'e2e-import',
    PORT: String(PORT),
    HOST: '127.0.0.1',
  },
  stdio: ['ignore', 'inherit', 'inherit'],
});

server.on('exit', () => {
  rmSync(tmpRepo, { recursive: true, force: true });
});

process.on('SIGTERM', () => {
  server.kill('SIGTERM');
});
