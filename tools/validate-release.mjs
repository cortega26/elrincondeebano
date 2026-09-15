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
    // Plan 191 (owner decision D1=ADD): the ship gate owns the selector
    // and plan-archive checks — same position philosophy as `validate`.
    name: 'check:e2e-selectors',
    command: 'npm',
    args: ['run', 'check:e2e-selectors'],
  },
  {
    name: 'build',
    command: 'npm',
    args: ['run', 'build'],
  },
  {
    name: 'test',
    command: 'npm',
    args: ['test'],
  },
  {
    name: 'check:plans',
    command: 'npm',
    args: ['run', 'check:plans'],
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
