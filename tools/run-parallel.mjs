// Plan 013 Step 3: run independent preflight generators concurrently with
// correct failure propagation (shell `&`+`wait` swallows exit codes).
// Usage: node tools/run-parallel.mjs "<command>" ["<command>" ...]
// Each command runs via sh -c with cwd at the repo root; exits non-zero
// listing every failed command when at least one fails.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function runCommandsParallel(commands) {
  return Promise.all(
    commands.map(
      (command) =>
        new Promise((resolve) => {
          const child = spawn(command, {
            shell: true,
            cwd: REPO_ROOT,
            stdio: 'inherit',
          });
          child.on('close', (code) => resolve({ command, code: code ?? 1 }));
          child.on('error', (err) => resolve({ command, code: 1, error: err }));
        })
    )
  );
}

// Plan 186: bounded worker pool for CPU-bound task functions (sharp
// encodes). Unbounded Promise.all would spike peak memory/FDs; serial
// `for await` pays the sum of all encodes. Results preserve input order;
// a rejection fails fast (remaining tasks still settle, then it throws the
// first error). Concurrency is clamped to >= 1.
export async function runTasksBounded(taskFns, limit) {
  const tasks = [...taskFns];
  const bounded = Math.max(1, Math.floor(limit) || 1);
  const results = new Array(tasks.length);
  let next = 0;
  let failed = null;

  async function worker() {
    while (next < tasks.length) {
      const index = next;
      next += 1;
      try {
        results[index] = await tasks[index]();
      } catch (err) {
        if (!failed) failed = err;
        results[index] = undefined;
      }
    }
  }

  const workers = [];
  for (let i = 0; i < Math.min(bounded, tasks.length); i += 1) {
    workers.push(worker());
  }
  await Promise.all(workers);
  if (failed) throw failed;
  return results;
}

async function main() {
  const commands = process.argv.slice(2);
  if (commands.length === 0) {
    console.error('Usage: run-parallel.mjs "<command>" ["<command>" ...]');
    process.exit(2);
  }
  const startedAt = Date.now();
  const results = await runCommandsParallel(commands);
  const failed = results.filter((r) => r.code !== 0);
  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  if (failed.length > 0) {
    for (const f of failed) console.error(`[parallel] FAILED (${f.code}): ${f.command}`);
    console.error(`[parallel] ${failed.length}/${results.length} commands failed in ${elapsed}s.`);
    process.exit(1);
  }
  console.log(`[parallel] ${results.length}/${results.length} commands ok in ${elapsed}s.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
