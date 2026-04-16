import { spawnSync } from 'node:child_process';

const stages = [
  {
    name: 'lint',
    command: 'npm',
    args: ['run', 'lint'],
  },
  {
    name: 'typecheck',
    command: 'npm',
    args: ['run', 'typecheck'],
  },
  {
    name: 'test',
    command: 'npm',
    args: ['test'],
  },
  {
    name: 'build',
    command: 'npm',
    args: ['run', 'build'],
  },
  {
    name: 'guardrails:assets',
    command: 'npm',
    args: ['run', 'guardrails:assets'],
  },
  {
    name: 'test:e2e',
    command: 'npm',
    args: ['run', 'test:e2e'],
  },
  {
    name: 'monitor:share-preview',
    command: 'npm',
    args: ['run', 'monitor:share-preview'],
  },
];

for (const [index, stage] of stages.entries()) {
  const label = `[${index + 1}/${stages.length}] ${stage.name}`;
  console.log(`\n==> ${label}`);

  const result = spawnSync(stage.command, stage.args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  if (result.error) {
    throw result.error;
  }

  if (typeof result.status === 'number' && result.status !== 0) {
    process.exit(result.status);
  }
}

console.log('\nRelease validation passed.');
