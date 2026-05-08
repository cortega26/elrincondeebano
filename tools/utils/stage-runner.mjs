import { spawnSync as defaultSpawnSync } from 'node:child_process';

function buildStageFailureError(stageName, detail, exitCode = 1, cause) {
  const error = new Error(`Stage failed: ${stageName}. ${detail}`, cause ? { cause } : undefined);
  error.exitCode = exitCode;
  return error;
}

function normalizeStage(stage) {
  if (!stage || typeof stage !== 'object') {
    throw new TypeError('Stage definition must be an object.');
  }
  if (typeof stage.name !== 'string' || !stage.name.trim()) {
    throw new TypeError('Stage definition must include a non-empty "name".');
  }
  if (typeof stage.command !== 'string' || !stage.command.trim()) {
    throw new TypeError(`Stage "${stage.name}" must include a non-empty "command".`);
  }
  if (!Array.isArray(stage.args) || !stage.args.every((value) => typeof value === 'string')) {
    throw new TypeError(`Stage "${stage.name}" must include string args.`);
  }

  return {
    name: stage.name.trim(),
    command: stage.command.trim(),
    args: [...stage.args],
  };
}

export function runStages(
  stages,
  {
    spawnSync = defaultSpawnSync,
    logger = console.log,
    successMessage = '',
    commandOptions = {},
    labelFormatter = (stage, index, total) => `[${index + 1}/${total}] ${stage.name}`,
  } = {}
) {
  if (!Array.isArray(stages) || stages.length === 0) {
    throw new TypeError('runStages requires a non-empty stage list.');
  }

  const normalizedStages = stages.map(normalizeStage);

  for (const [index, stage] of normalizedStages.entries()) {
    logger(`\n==> ${labelFormatter(stage, index, normalizedStages.length)}`);

    const result = spawnSync(stage.command, stage.args, {
      stdio: 'inherit',
      shell: false,
      ...commandOptions,
    });

    if (result.error) {
      throw buildStageFailureError(stage.name, result.error.message, 1, result.error);
    }

    if (typeof result.status === 'number' && result.status !== 0) {
      throw buildStageFailureError(stage.name, `Exited with code ${result.status}.`, result.status);
    }

    if (result.signal) {
      throw buildStageFailureError(stage.name, `Terminated by signal ${result.signal}.`);
    }
  }

  if (successMessage) {
    logger(`\n${successMessage}`);
  }
}
