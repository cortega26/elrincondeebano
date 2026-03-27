#!/usr/bin/env node
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const DEFAULT_BASE_URL = 'http://127.0.0.1:4173';
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

function sanitizeEnv() {
  const env = { ...process.env, PORT: '4173' };
  delete env.ELECTRON_RUN_AS_NODE;
  return env;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function resolveLocalProbeTarget(baseUrl, pathname = '/index.html') {
  const parsed = new URL(String(baseUrl));
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`Unsupported Cypress baseUrl protocol: ${parsed.toString()}`);
  }
  if (!LOCAL_HOSTS.has(parsed.hostname)) {
    throw new Error(`Cypress baseUrl must point to a loopback host: ${parsed.toString()}`);
  }
  if (parsed.username || parsed.password) {
    throw new Error(`Cypress baseUrl must not include credentials: ${parsed.toString()}`);
  }

  const normalizedPath = String(pathname || '').trim() || '/';
  return {
    protocol: parsed.protocol,
    hostname: parsed.hostname,
    port: parsed.port,
    pathname: normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`,
  };
}

function buildLocalProbeUrl(target) {
  const hostname = target.hostname.includes(':') ? `[${target.hostname}]` : target.hostname;
  const port = target.port ? `:${target.port}` : '';
  return new URL(`${target.protocol}//${hostname}${port}${target.pathname}`);
}

async function fetchLocalProbe(baseUrl, pathname = '/index.html') {
  const target = resolveLocalProbeTarget(baseUrl, pathname);
  const probeUrl = buildLocalProbeUrl(target);
  return fetch(probeUrl, { method: 'GET' });
}

async function waitForServer(baseUrl, timeoutMs = 45000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetchLocalProbe(baseUrl);
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
  try {
    const response = await fetchLocalProbe(baseUrl);
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
  const serverAlreadyRunning = await isServerReachable(DEFAULT_BASE_URL);

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
        await waitForServer(DEFAULT_BASE_URL);
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

const isDirectRun = process.argv[1] === fileURLToPath(import.meta.url);
if (isDirectRun) {
  main().catch((error) => {
    console.error(error?.message || error);
    process.exit(1);
  });
}
