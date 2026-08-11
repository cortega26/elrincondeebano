// E2E harness for pagination/bulk-scope (plan 088): serves a COPY of the
// 80-product fixture from a temp repo on :3102. Env:
// ADMIN_CREDENTIAL=e2e-scope, PORT=3102.
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';

const PORT = Number(process.env.PORT) || 3102;
const fixtureDir = resolve(process.cwd(), 'test', 'fixtures', 'scope-e2e-repo');
const webDist = resolve(process.cwd(), 'dist', 'web');
const tmpRepo = `${tmpdir()}/cm-scope-e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

mkdirSync(tmpRepo, { recursive: true });
cpSync(fixtureDir, tmpRepo, { recursive: true });
cpSync(webDist, resolve(tmpRepo, 'admin', 'content-manager', 'dist', 'web'), {
  recursive: true,
});

const server = spawn('node', ['--import', 'tsx', 'src/server/start.ts'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    REPO_ROOT: tmpRepo,
    ADMIN_MODE: 'operator',
    ADMIN_CREDENTIAL: 'e2e-scope',
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
