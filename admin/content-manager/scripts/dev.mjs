// Dev loop launcher: one command starts both processes.
//
// `admin:dev` used to start only the API (:3000). On a fresh clone that command
// served API routes plus a 404 at `/` because `dist/web/` is gitignored and only
// exists after `admin:build`. The SPA dev server (Vite :5173, HMR) proxies
// `/api/v1` to :3000, so starting both makes `npm run admin:dev` self-sufficient.
// Plan 124 keeps the individual `dev:api` / `dev:web` scripts for focused work.
'use strict';

import { spawn } from 'node:child_process';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const apiPort = process.env.PORT || '3000';
const webPort = '5173';
const devWebOrigin = `http://127.0.0.1:${webPort}`;
const children = [];
let shuttingDown = false;

function isRunning(child) {
  return child.exitCode === null && child.signalCode === null;
}

function waitForExit(child) {
  if (!isRunning(child)) return Promise.resolve();
  return new Promise((resolve) => child.once('exit', resolve));
}

function shutdown(exitCode) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (isRunning(child)) child.kill('SIGTERM');
  }
  const forceExit = setTimeout(() => {
    for (const child of children) {
      if (isRunning(child)) child.kill('SIGKILL');
    }
    process.exit(exitCode);
  }, 3000);
  forceExit.unref();
  Promise.all(children.map(waitForExit)).then(() => process.exit(exitCode));
}

function start(script, extraEnv = {}) {
  const child = spawn(npmCommand, ['run', script], {
    stdio: 'inherit',
    env: { ...process.env, ...extraEnv },
  });
  children.push(child);
  child.on('error', (error) => {
    console.error(`[admin:dev] could not start "${script}": ${error.message}`);
    shutdown(1);
  });
  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    console.error(`[admin:dev] "${script}" exited (${signal ?? code}); stopping the other process`);
    shutdown(code ?? 1);
  });
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    for (const child of children) {
      if (isRunning(child)) child.kill(signal);
    }
    shutdown(0);
  });
}

console.log(`[admin:dev] API: http://127.0.0.1:${apiPort}`);
console.log(`[admin:dev] UI:  ${devWebOrigin} (Vite HMR, proxies /api/v1 to :${apiPort})`);
console.log('[admin:dev] Credential: data/.admin-credential (the UI prompts for it)');
console.log(`[admin:dev] http://127.0.0.1:${apiPort} redirects to the UI while dist/web is absent`);

start('dev:api', { ADMIN_DEV_WEB_ORIGIN: devWebOrigin });
start('dev:web', { ADMIN_API_PORT: apiPort });
