import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const checks = [
  'dependency-manifest-compat.mjs',
  'secret-scan.mjs',
  'sw-cache-bump.mjs',
  'sw-forbidden.mjs',
  'checkout-guard.mjs',
  'critical-css.mjs',
  'legacy-storefront-surface.mjs',
  'orphan-assets.js',
];

for (const check of checks) {
  console.log(`\n==> ${check}`);
  const result = spawnSync('node', [path.join(__dirname, check)], {
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log('\nAll guardrails passed.');
