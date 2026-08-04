import { createApp } from './app.ts';
import { resolve } from 'node:path';

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '127.0.0.1';

if (HOST !== '127.0.0.1' && HOST !== 'localhost' && HOST !== '::1') {
  console.error(`HOST=${HOST} is not loopback. Refusing to start.`);
  process.exit(1);
}

const VALID_MODES = new Set(['operator', 'read-only']);
const mode = process.env.ADMIN_MODE || 'read-only';
if (!VALID_MODES.has(mode)) {
  console.error(`ADMIN_MODE must be one of: ${[...VALID_MODES].join(', ')}. Got: ${mode}`);
  process.exit(1);
}

const enableWrites = mode === 'operator';

// The launch credential is never served over HTTP (plan 071): the operator
// sets ADMIN_CREDENTIAL, or createApp generates one which start logs exactly
// once below. Mirror this contract in .env.example (plan 079).
const launchCredential = process.env.ADMIN_CREDENTIAL || undefined;

const repoRoot = process.env.REPO_ROOT || resolve(process.cwd(), '..', '..');

const app = createApp({ repoRoot, enableWrites, logger: true, launchCredential });

async function start(): Promise<void> {
  try {
    await app.listen({ port: PORT, host: HOST });
    console.log(`Content Manager running at http://${HOST}:${PORT} (mode: ${mode})`);
    if (enableWrites) {
      if (launchCredential) {
        console.log('Write mode enabled — launch credential from ADMIN_CREDENTIAL environment');
      } else {
        const generated = (app as unknown as { launchCredential?: string }).launchCredential;
        console.log(
          `Write mode enabled — generated launch credential: ${generated ?? '(unknown)'}`
        );
      }
    } else {
      console.log('Read-only mode — mutations are rejected');
    }
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

async function shutdown(signal: string): Promise<void> {
  app.log.info(`Received ${signal}. Shutting down...`);
  await app.close();
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

start();
