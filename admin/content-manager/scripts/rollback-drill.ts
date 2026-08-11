import { writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';

// Plan 069 Step 3: rehearsed rollback and failure drills with machine
// evidence. Each drill runs against disposable temp repos (never the real
// catalog) and reports the resulting canonical file/Git state.
//
// Evidence: reports/certification/evidence/rollback-drill.json (commit-bound).

const repoRoot = resolve(process.cwd(), '..', '..');
const adminDir = resolve(repoRoot, 'admin', 'content-manager');
const evidenceDir = resolve(repoRoot, 'reports', 'certification', 'evidence');
mkdirSync(evidenceDir, { recursive: true });

function getCommitSha(): string {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: repoRoot,
      encoding: 'utf-8',
      timeout: 5000,
    }).trim();
  } catch {
    return 'unknown';
  }
}

interface Drill {
  id: string;
  scenario: string;
  command: string;
  expected: string;
}

const DRILLS: Drill[] = [
  {
    id: 'rollback-git-revert',
    scenario: 'Git revert restores a commit (documented rollback path)',
    command:
      'git revert --no-edit HEAD, then verify the reverted file matches the pre-commit content',
    expected: 'canonical file byte-identical to pre-commit state after revert',
  },
  {
    id: 'rollback-backup-restore',
    scenario: 'Backup/restore cycle preserves canonical data',
    command: 'npx vitest run test/integration/rollbackDrill.test.ts',
    expected: 'restored rev/version matches the original snapshot',
  },
  {
    id: 'rollback-restart-recovery',
    scenario: 'Process kill/restart: idempotency and recovery survive restart',
    command: 'npx vitest run test/integration/restartRecovery.test.ts',
    expected: 'persisted state loads across restarts; recovery endpoint reports pending state',
  },
  {
    id: 'rollback-interrupted-apply',
    scenario: 'Interrupted apply leaves the catalog intact and journals the failure',
    command: 'npx vitest run test/integration/failureInjection.test.ts',
    expected: 'catalog survives IO/rename failures; doctor sees the journaled failure',
  },
  {
    id: 'rollback-media-failure',
    scenario: 'Media failure rolls back files atomically',
    command:
      'npx vitest run test/integration/mediaWorkbench.test.ts test/contract/mediaSecurity.test.ts',
    expected: 'staged/uploaded garbage rejected; no canonical asset mutation on failure',
  },
  {
    id: 'rollback-sync-disconnect',
    scenario: 'Sync disconnect/conflict keeps queue durable and token-free status',
    command: 'npx vitest run test/integration/syncWorkflow.test.ts',
    expected:
      '401 permanent, 429/5xx backoff, 409 durable conflict, redirects rejected, no token leak',
  },
  {
    id: 'rollback-failed-push',
    scenario: 'Failed push leaves a recovery journal and rejects unrelated staged paths',
    command: 'npx vitest run test/integration/publicationRecovery.test.ts',
    expected: 'pending recovery detected after simulated failed push',
  },
  {
    id: 'rollback-failed-validation',
    scenario: 'Failed validation blocks publication before any write',
    command:
      'npx vitest run test/contract/validationAdapter.test.ts test/integration/publication.test.ts',
    expected: 'preflight failure returns 4xx and commits nothing',
  },
];

function runVitest(files: string[]): { ok: boolean; output: string } {
  const args = ['vitest', 'run', ...files, '--reporter=dot'];
  try {
    const output = execFileSync('npx', args, {
      cwd: adminDir,
      encoding: 'utf-8',
      timeout: 300_000,
    });
    return { ok: true, output: output.slice(-2000) };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    return { ok: false, output: (e.stdout ?? e.stderr ?? e.message ?? 'unknown').slice(-2000) };
  }
}

function runGitRevertDrill(): { ok: boolean; output: string } {
  const dir = resolve(tmpdir(), `cm-revert-drill-${Date.now()}`);
  let log = '';
  try {
    execFileSync('git', ['clone', '-q', repoRoot, dir], { encoding: 'utf-8', timeout: 120_000 });
    execFileSync('git', ['config', 'user.email', 'drill@example.invalid'], { cwd: dir });
    execFileSync('git', ['config', 'user.name', 'rollback drill'], { cwd: dir });

    const before = readFileSync(resolve(dir, 'data', 'product_data.json'), 'utf-8');
    const mutated = JSON.stringify({ version: 'drill-mutated', rev: 1, products: [] }, null, 2);
    writeFileSync(resolve(dir, 'data', 'product_data.json'), mutated);
    execFileSync('git', ['add', 'data/product_data.json'], { cwd: dir });
    execFileSync('git', ['commit', '-m', 'drill: simulated mutation'], {
      cwd: dir,
      encoding: 'utf-8',
    });
    const revertSha = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: dir,
      encoding: 'utf-8',
    }).trim();
    execFileSync('git', ['revert', '--no-edit', revertSha], { cwd: dir, encoding: 'utf-8' });

    const after = readFileSync(resolve(dir, 'data', 'product_data.json'), 'utf-8');
    const status = execFileSync('git', ['status', '--short'], {
      cwd: dir,
      encoding: 'utf-8',
    }).trim();
    log += `reverted commit ${revertSha.slice(0, 8)}; working tree clean: ${status === ''}\n`;
    log += `canonical file byte-identical after revert: ${before === after}`;
    return { ok: before === after && status === '', output: log };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    return { ok: false, output: `${log}\n${e.stderr ?? e.stdout ?? e.message ?? 'unknown error'}` };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const commitSha = getCommitSha();
const results: Array<{
  id: string;
  scenario: string;
  command: string;
  expected: string;
  status: 'pass' | 'fail';
  output_snippet: string;
}> = [];

console.log('=== Rollback and failure drills (plan 069 Step 3) ===');
console.log(`Commit: ${commitSha}\n`);

for (const drill of DRILLS) {
  let result: { ok: boolean; output: string };
  if (drill.id === 'rollback-git-revert') {
    result = runGitRevertDrill();
  } else {
    const files = drill.command.replace('npx vitest run', '').trim().split(/\s+/);
    result = runVitest(files);
  }
  const icon = result.ok ? '✅' : '❌';
  console.log(`  ${icon} ${drill.id}: ${result.ok ? 'pass' : 'FAIL'}`);
  results.push({ ...drill, status: result.ok ? 'pass' : 'fail', output_snippet: result.output });
}

const failed = results.filter((r) => r.status === 'fail').length;
const evidence = {
  row_id: 'manual-rollback-drill',
  scenario: 'Rollback and failure recovery rehearsals',
  commit_sha: commitSha,
  timestamp: new Date().toISOString(),
  status: failed === 0 ? 'pass' : 'fail',
  drills: results,
};

const evidencePath = resolve(evidenceDir, 'rollback-drill.json');
writeFileSync(evidencePath, JSON.stringify(evidence, null, 2));

console.log(`\n${results.length - failed}/${results.length} drills passed`);
console.log(`Evidence: ${evidencePath}`);

if (failed > 0) process.exit(1);
console.log('✅ Rollback drills passed');
