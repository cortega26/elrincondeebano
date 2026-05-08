import { runStages } from './utils/stage-runner.mjs';

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

try {
  runStages(stages, {
    successMessage: 'Release validation passed.',
  });
} catch (error) {
  console.error(error?.message || String(error));
  process.exitCode = error?.exitCode || 1;
}
