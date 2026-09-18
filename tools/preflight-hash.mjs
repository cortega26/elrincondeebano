// Plan 013 Step 3: content-hash gate for preflight image steps.
// Skips a step when its declared inputs are byte-identical to the last
// successful run AND its declared outputs all exist. Steps whose inputs
// cannot be fully observed are left ungated (they keep their own
// write-if-changed / manifest logic) — see package.json preflight.
//
// Usage:
//   node tools/preflight-hash.mjs --step <name> --inputs <csv paths>
//     [--outputs <csv paths>] -- <command> [args...]
// Paths are relative to the repo root. State lives in reports/ (gitignored).
// Inputs may be files (content-hashed, streamed) or directories (recursive
// listing: names + mtime/size — membership and artwork edits invalidate).
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STATE_DIR = path.join(REPO_ROOT, 'reports', 'preflight-hashes');

export function hashInputFiles(relativePaths) {
  const hash = createHash('sha256');
  const sorted = [...relativePaths].sort();
  for (const rel of sorted) {
    const abs = path.resolve(REPO_ROOT, rel);
    hash.update(rel + '\0');
    // Plan 186: directories hash as listings (sorted names + mtime/size per
    // entry, recursive, no content reads) — suitable for source trees whose
    // membership or artwork changes must invalidate the gate (icons,
    // override rasters). Any race or unreadable entry forces a run.
    let stat;
    try {
      stat = fs.statSync(abs);
    } catch {
      return null;
    }
    if (stat.isDirectory()) {
      if (!hashDirectory(hash, abs)) {
        return null;
      }
      hash.update('\0');
      continue;
    }
    if (!stat.isFile()) {
      return null;
    }
    // Plan 185: stream large inputs instead of buffering whole files.
    let fd;
    try {
      fd = fs.openSync(abs, 'r');
      const buf = Buffer.alloc(64 * 1024);
      let bytesRead = fs.readSync(fd, buf, 0, buf.length, null);
      while (bytesRead > 0) {
        hash.update(buf.subarray(0, bytesRead));
        bytesRead = fs.readSync(fd, buf, 0, buf.length, null);
      }
    } catch {
      // Raced away mid-read: force a run.
      return null;
    } finally {
      if (fd !== undefined) {
        try {
          fs.closeSync(fd);
        } catch {
          // Best-effort close.
        }
      }
    }
    hash.update('\0');
  }
  return hash.digest('hex');
}

// Plan 181: step names become filenames — accept only a tight class so
// `--step ../evil` cannot escape the state directory.
export function assertSafeStepName(step) {
  if (typeof step !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9-_]*$/.test(step)) {
    throw new Error(`Invalid step name: ${JSON.stringify(step)} — use [A-Za-z0-9-_]`);
  }
  return step;
}

// Plan 186: recursive directory listing hash (names + mtime + size, sorted).
// Returns false when anything is unobservable (caller forces a run).
// NOTE: metadata-only by design — content edits that preserve mtime+size
// (cp -p, same-millisecond rewrites) do not invalidate. All current
// directory inputs (artwork trees) change mtime on edit.
function hashDirectory(hash, absDir) {
  let entries;
  try {
    entries = fs.readdirSync(absDir, { withFileTypes: true });
  } catch {
    return false;
  }
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const entry of entries) {
    hash.update(entry.name + '\0');
    const full = path.join(absDir, entry.name);
    if (entry.isDirectory()) {
      if (!hashDirectory(hash, full)) {
        return false;
      }
      continue;
    }
    let stat;
    try {
      stat = fs.statSync(full);
    } catch {
      return false;
    }
    if (!stat.isFile()) {
      return false;
    }
    hash.update(`${stat.mtimeMs}:${stat.size}\0`);
  }
  return true;
}

export function readStepState(step) {
  assertSafeStepName(step);
  const file = path.join(STATE_DIR, `${step}.json`);
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

export function writeStepState(step, hash) {
  assertSafeStepName(step);
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(STATE_DIR, `${step}.json`),
    JSON.stringify({ step, hash, updatedAt: new Date().toISOString() }) + '\n'
  );
}

export function shouldSkipStep(step, inputPaths, outputPaths = []) {
  const hash = hashInputFiles(inputPaths);
  if (!hash) return { skip: false, hash: null, reason: 'unobservable-inputs' };
  const state = readStepState(step);
  if (!state || state.hash !== hash) return { skip: false, hash, reason: 'inputs-changed' };
  for (const rel of outputPaths) {
    if (!fs.existsSync(path.resolve(REPO_ROOT, rel))) {
      return { skip: false, hash, reason: 'outputs-missing' };
    }
  }
  return { skip: true, hash, reason: 'unchanged' };
}

function parseArgs(argv) {
  const opts = { step: null, inputs: [], outputs: [] };
  const cmd = [];
  let i = 0;
  let inCmd = false;
  while (i < argv.length) {
    const arg = argv[i];
    if (inCmd) {
      cmd.push(arg);
      i += 1;
      continue;
    }
    if (arg === '--') {
      inCmd = true;
      i += 1;
      continue;
    }
    if (arg === '--step') {
      opts.step = argv[i + 1];
      i += 2;
      continue;
    }
    if (arg === '--inputs') {
      opts.inputs = argv[i + 1]
        ? argv[i + 1]
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : [];
      i += 2;
      continue;
    }
    if (arg === '--outputs') {
      opts.outputs = argv[i + 1]
        ? argv[i + 1]
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : [];
      i += 2;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return { opts, cmd };
}

function main() {
  const { opts, cmd } = parseArgs(process.argv.slice(2));
  if (!opts.step || opts.inputs.length === 0 || cmd.length === 0) {
    console.error(
      'Usage: preflight-hash.mjs --step <name> --inputs <csv> [--outputs <csv>] -- <command> [args...]'
    );
    process.exit(2);
  }
  let decision;
  try {
    decision = shouldSkipStep(opts.step, opts.inputs, opts.outputs);
  } catch (err) {
    console.error(`[hash-gate] ${(err && err.message) || String(err)}`);
    process.exit(2);
  }
  if (decision.skip) {
    console.log(`[hash-gate] ${opts.step}: inputs unchanged, skipping.`);
    process.exit(0);
  }
  if (decision.reason !== 'inputs-changed') {
    console.log(`[hash-gate] ${opts.step}: ${decision.reason}, running.`);
  }
  const result = spawnSync(cmd[0], cmd.slice(1), { stdio: 'inherit', cwd: REPO_ROOT });
  if (result.status === 0 && decision.hash) {
    writeStepState(opts.step, decision.hash);
  }
  process.exit(result.status ?? 1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
