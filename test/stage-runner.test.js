'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

async function loadModule() {
  return import('../tools/utils/stage-runner.mjs');
}

test('runStages executes stages sequentially with shared defaults', async () => {
  const { runStages } = await loadModule();
  const calls = [];
  const logs = [];

  runStages(
    [
      { name: 'lint', command: 'npm', args: ['run', 'lint'] },
      { name: 'test', command: 'npm', args: ['test'] },
    ],
    {
      spawnSync(command, args, options) {
        calls.push({ command, args, options });
        return { status: 0, error: undefined, signal: null };
      },
      logger(message) {
        logs.push(message);
      },
      successMessage: 'Done.',
    }
  );

  assert.deepEqual(
    calls.map((call) => ({ command: call.command, args: call.args })),
    [
      { command: 'npm', args: ['run', 'lint'] },
      { command: 'npm', args: ['test'] },
    ]
  );
  assert.equal(calls[0].options.stdio, 'inherit');
  assert.equal(calls[0].options.shell, false);
  assert.match(logs[0], /\[1\/2\] lint/);
  assert.match(logs[1], /\[2\/2\] test/);
  assert.equal(logs[2], '\nDone.');
});

test('runStages surfaces non-zero exits with stage-specific exit codes', async () => {
  const { runStages } = await loadModule();

  assert.throws(
    () =>
      runStages([{ name: 'build', command: 'npm', args: ['run', 'build'] }], {
        spawnSync() {
          return { status: 2, error: undefined, signal: null };
        },
        logger() {},
      }),
    (error) => {
      assert.match(error.message, /Stage failed: build\. Exited with code 2\./);
      assert.equal(error.exitCode, 2);
      return true;
    }
  );
});

test('runStages wraps spawn errors with actionable context', async () => {
  const { runStages } = await loadModule();
  const spawnFailure = new Error('ENOENT');

  assert.throws(
    () =>
      runStages([{ name: 'guardrail', command: 'missing-bin', args: [] }], {
        spawnSync() {
          return { status: null, error: spawnFailure, signal: null };
        },
        logger() {},
      }),
    (error) => {
      assert.match(error.message, /Stage failed: guardrail\. ENOENT/);
      assert.equal(error.exitCode, 1);
      assert.equal(error.cause, spawnFailure);
      return true;
    }
  );
});
