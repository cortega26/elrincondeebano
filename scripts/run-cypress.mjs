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

function resolveLocalProbeUrl(baseUrl) {
  const parsed = new URL(String(baseUrl));
  const localHosts = new Set(['127.0.0.1', 'localhost', '::1']);
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`Unsupported Cypress baseUrl protocol: ${parsed.toString()}`);
  }
  if (!localHosts.has(parsed.hostname)) {
    throw new Error(`Cypress baseUrl must point to a loopback host: ${parsed.toString()}`);
  }
  return new URL('/index.html', parsed);
}

async function waitForServer(baseUrl, timeoutMs = 45000) {
  const probeUrl = resolveLocalProbeUrl(baseUrl);
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(probeUrl, { method: 'GET' });
      if (response.ok) {
        return;
      }
    } catch {
      // Keep polling until timeout.
    }
    await wait(500);
  }
  throw new Error(`Timed out waiting for Cypress baseUrl: ${baseUrl}`);
}

async function isServerReachable(baseUrl) {
  const probeUrl = resolveLocalProbeUrl(baseUrl);
  try {
    const response = await fetch(probeUrl, { method: 'GET' });
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

  const exitCode = await (async () => {
    try {
      if (!serverAlreadyRunning) {
        await waitForServer(baseUrl);
      }
      const extraArgs = process.argv.slice(2);
      return await runCypress(env, extraArgs);
    } finally {
      if (server && !server.killed) {
        server.kill('SIGTERM');
      }
    }
  })();

  process.exit(exitCode);
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
