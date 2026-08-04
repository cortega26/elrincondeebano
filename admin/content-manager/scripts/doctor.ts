import { runDoctor } from '../src/server/services/doctor.ts';

const repoRoot = process.env.REPO_ROOT ?? process.cwd();
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
