import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runStages } from '../utils/stage-runner.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const stages = [
  'dependency-manifest-compat.mjs',
  'secret-scan.mjs',
  'sw-cache-bump.mjs',
  'sw-forbidden.mjs',
  'checkout-guard.mjs',
  'critical-css.mjs',
  'legacy-storefront-surface.mjs',
  'image-size-check.mjs',
  'orphan-assets.js',
].map((check) => ({
  name: check,
  command: process.execPath,
  args: [path.join(__dirname, check)],
}));

try {
  runStages(stages, {
    labelFormatter: (stage) => stage.name,
    successMessage: 'All guardrails passed.',
  });
} catch (error) {
  console.error(error?.message || String(error));
  process.exitCode = error?.exitCode || 1;
}
