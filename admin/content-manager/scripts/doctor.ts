import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { runDoctor } from '../src/server/services/doctor.ts';

// The CLI runs from the workspace dir by default (npm -w); resolve the repo
// root as the workspace parent unless REPO_ROOT overrides it.
function resolveRepoRoot(): string {
  if (process.env.REPO_ROOT) return process.env.REPO_ROOT;
  const candidates = [process.cwd(), resolve(process.cwd(), '..', '..')];
  for (const candidate of candidates) {
    if (existsSync(resolve(candidate, 'data', 'product_data.json'))) return candidate;
  }
  return candidates[1] ?? process.cwd();
}

const repoRoot = resolveRepoRoot();
const report = runDoctor(repoRoot);

console.log('=== Content Manager Doctor ===');
console.log(`Node: ${report.nodeVersion}`);
console.log(`Root: ${report.repoRoot}`);
console.log(`Time: ${report.timestamp}`);
console.log('');

for (const check of report.checks) {
  const icon = check.status === 'ok' ? '✅' : check.status === 'warn' ? '⚠️' : '❌';
  console.log(`${icon} ${check.name}: ${check.message}`);
}

console.log('');
console.log(
  `Summary: ${report.summary.ok} ok, ${report.summary.warn} warnings, ${report.summary.error} errors`
);
