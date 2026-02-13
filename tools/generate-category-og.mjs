import { spawnSync } from 'node:child_process';

const userArgs = process.argv.slice(2);
const hasCommand = userArgs.includes('--sync') || userArgs.includes('--one') || userArgs.includes('--delete');
const args = hasCommand ? userArgs : ['--sync', ...userArgs];

const candidates = process.platform === 'win32'
  ? [
      ['python', []],
      ['python3', []],
      ['py', ['-3']],
    ]
  : [
      ['python3', []],
      ['python', []],
    ];

let lastError = null;
for (const [bin, prefix] of candidates) {
  const run = spawnSync(bin, [...prefix, '-m', 'tools.category_og', ...args], {
    cwd: process.cwd(),
    stdio: 'inherit',
  });

  if (!run.error && run.status === 0) {
    process.exit(0);
  }
  if (run.error && run.error.code === 'ENOENT') {
    lastError = run.error;
    continue;
  }
  process.exit(run.status ?? 1);
}

if (lastError) {
  console.error('No Python runtime found to execute tools.category_og.');
}
process.exit(1);
