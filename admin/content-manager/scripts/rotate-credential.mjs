// Plan 127 F3.5: rotate the admin launch credential — generates a new
// 256-bit credential and replaces data/.admin-credential (0600). The old
// value stops authenticating on the next server start (start.ts reads the
// file when ADMIN_CREDENTIAL is unset). Never prints the value.
'use strict';

import { randomBytes } from 'node:crypto';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO_ROOT = process.env.REPO_ROOT || resolve(import.meta.dirname, '..', '..', '..');
const CREDENTIAL_PATH = resolve(REPO_ROOT, 'data', '.admin-credential');

function generateCredential() {
  return `cm-${randomBytes(32).toString('base64url')}`;
}

async function run() {
  const value = generateCredential();
  mkdirSync(resolve(REPO_ROOT, 'data'), { recursive: true });
  writeFileSync(CREDENTIAL_PATH, value, { encoding: 'utf-8', mode: 0o600, flush: true });
  console.log(`[rotate-credential] new launch credential written to ${CREDENTIAL_PATH} (0600)`);
  console.log(
    '[rotate-credential] reinicia el servidor para activarla; la anterior deja de autenticar.'
  );
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
