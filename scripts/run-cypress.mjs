#!/usr/bin/env node
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const baseUrl = 'http://127.0.0.1:4173';

function sanitizeEnv() {
  const env = { ...process.env, PORT: '4173' };
  delete env.ELECTRON_RUN_AS_NODE;
  return env;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(url, timeoutMs = 45000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(`${url}/index.html`, { method: 'GET' });
      if (response.ok) {
        return;
      }
    } catch {
      // Keep polling until timeout.
    }
    await wait(500);
  }
  throw new Error(`Timed out waiting for Cypress baseUrl: ${url}`);
}

async function isServerReachable(url) {
  try {
    const response = await fetch(`${url}/index.html`, { method: 'GET' });
    return response.ok;
  } catch {
    return false;
  }
}

function runCypress(env, extraArgs = []) {
  const args = ['run', ...extraArgs];
  const cypressCliPath = path.join(rootDir, 'node_modules', 'cypress', 'bin', 'cypress');
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cypressCliPath, ...args], {
      cwd: rootDir,
      stdio: 'inherit',
      env,
    });
    child.on('error', reject);
    child.on('exit', (code) => resolve(typeof code === 'number' ? code : 1));
  });
}

async function main() {
  const env = sanitizeEnv();
  let server = null;
  const serverAlreadyRunning = await isServerReachable(baseUrl);

  if (!serverAlreadyRunning) {
    server = spawn(process.execPath, [path.join(rootDir, 'scripts', 'dev-server.mjs'), 'build'], {
      cwd: rootDir,
      stdio: 'inherit',
      env,
    });
  }

  let exitCode = 1;
  try {
    if (!serverAlreadyRunning) {
      await waitForServer(baseUrl);
    }
    const extraArgs = process.argv.slice(2);
    exitCode = await runCypress(env, extraArgs);
  } finally {
    if (server && !server.killed) {
      server.kill('SIGTERM');
    }
  }

  process.exit(exitCode);
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
