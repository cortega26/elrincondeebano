import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';

const repoRoot = resolve(process.cwd(), '..', '..');
const reportDir = resolve(repoRoot, 'reports', 'certification');
mkdirSync(reportDir, { recursive: true });

interface EvidenceRow {
  id: string;
  scenario: string;
  status: 'pass' | 'fail' | 'untested' | 'manual';
  evidence_path?: string;
  test_command?: string;
  python_equivalent?: string;
  details?: string;
  owner_plan?: string;
}

interface CertificationReport {
  schema_version: 1;
  title: string;
  commit_sha: string;
  generated_at: string;
  summary: { total: number; pass: number; fail: number; untested: number; manual: number };
  evidence_rows: EvidenceRow[];
  exit_gate: {
    ready: boolean;
    all_automated_pass: boolean;
    zero_stale_evidence: boolean;
    maintainer_signature: string | null;
  };
  commands: Record<string, string>;
}

function getCommitSha(): string {
  try {
    return execSync('git rev-parse HEAD', {
      cwd: repoRoot,
      encoding: 'utf-8',
      timeout: 5000,
    }).trim();
  } catch {
    return 'unknown';
  }
}

function readTestOutput(command: string, cwd: string): { ok: boolean; output: string } {
  try {
    const output = execSync(command, {
      cwd,
      encoding: 'utf-8',
      timeout: 120_000,
      env: { ...process.env },
    });
    return { ok: true, output: output.slice(-2000) };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    return {
      ok: false,
      output: (e.stderr ?? e.stdout ?? e.message ?? 'unknown error').slice(-2000),
    };
  }
}

const adminDir = resolve(repoRoot, 'admin', 'content-manager');
const commitSha = getCommitSha();

const automatedRows: EvidenceRow[] = [
  {
    id: 'typecheck',
    scenario: 'TypeScript typecheck passes with zero errors',
    status: 'untested',
    test_command: 'npx tsc -p tsconfig.json --noEmit',
    evidence_path: 'reports/certification/evidence/typecheck.json',
  },
  {
    id: 'unit-test',
    scenario: 'Vitest unit + integration test suite passes',
    status: 'untested',
    test_command: 'npx vitest run',
    evidence_path: 'reports/certification/evidence/unit-test.json',
  },
  {
    id: 'coverage',
    scenario: 'Coverage thresholds met (domain 95/90, repository 90/85, server 85/80, web 80/75)',
    status: 'untested',
    test_command: 'npx vitest run --coverage',
    evidence_path: 'reports/certification/evidence/coverage.json',
  },
  {
    id: 'build',
    scenario: 'Vite production build succeeds',
    status: 'untested',
    test_command: 'npm run build',
    evidence_path: 'reports/certification/evidence/build.json',
  },
  {
    id: 'shadow-read',
    scenario: 'Shadow read parses all real products with zero schema errors',
    status: 'untested',
    test_command: 'npm run shadow-read',
    evidence_path: 'reports/certification/evidence/shadow-read.json',
  },
  {
    id: 'parity',
    scenario: 'Parity report finds zero unexplained field mismatches',
    status: 'untested',
    test_command: 'npm run parity',
    evidence_path: 'reports/certification/evidence/parity.json',
    owner_plan: '065',
  },
  {
    id: 'e2e-smoke',
    scenario: 'Playwright E2E smoke tests pass on disposable server',
    status: 'untested',
    test_command: 'npx playwright test -c playwright.config.ts',
    evidence_path: 'reports/certification/evidence/e2e-smoke.json',
  },
  {
    id: 'doctor',
    scenario: 'Doctor diagnostics complete with actionable results',
    status: 'untested',
    test_command: 'npm run doctor',
    evidence_path: 'reports/certification/evidence/doctor.json',
  },
];

const parityRows: EvidenceRow[] = [
  {
    id: 'parity-products',
    scenario: 'Browse, search, filter product catalog',
    status: 'untested',
    owner_plan: '059',
    python_equivalent: 'admin/product_manager/ui/main_window.py',
  },
  {
    id: 'parity-create',
    scenario: 'Create product with all fields',
    status: 'untested',
    owner_plan: '059, 061',
    python_equivalent: 'admin/product_manager/ui/product_form.py',
  },
  {
    id: 'parity-edit',
    scenario: 'Edit product with revision tracking',
    status: 'untested',
    owner_plan: '059',
    python_equivalent: 'admin/product_manager/services.py',
  },
  {
    id: 'parity-archive',
    scenario: 'Archive and restore products',
    status: 'untested',
    owner_plan: '059',
    python_equivalent: 'admin/product_manager/ui/main_window.py',
  },
  {
    id: 'parity-reorder',
    scenario: 'Global product reorder with identity',
    status: 'untested',
    owner_plan: '059',
    python_equivalent: 'admin/product_manager/ui/components.py',
  },
  {
    id: 'parity-bulk',
    scenario: 'Bulk preview/apply across all filters',
    status: 'untested',
    owner_plan: '059',
    python_equivalent: 'admin/product_manager/ui/bulk_operations_mixin.py',
  },
  {
    id: 'parity-categories',
    scenario: 'Category CRUD with product safety',
    status: 'untested',
    owner_plan: '059',
    python_equivalent: 'admin/product_manager/category_gui.py',
  },
  {
    id: 'parity-bundles',
    scenario: 'Bundle CRUD with product references',
    status: 'untested',
    owner_plan: '066',
    python_equivalent: 'admin/product_manager/ui/storefront_dialogs.py',
  },
  {
    id: 'parity-import',
    scenario: 'Import preview and apply with conflict resolution',
    status: 'untested',
    owner_plan: '060',
    python_equivalent: 'admin/product_manager/ui/import_export_mixin.py',
  },
  {
    id: 'parity-export',
    scenario: 'JSON/CSV export matching Python semantics',
    status: 'untested',
    owner_plan: '060',
    python_equivalent: 'admin/product_manager/ui/import_export_mixin.py',
  },
  {
    id: 'parity-history',
    scenario: 'Audit trail with before/after snapshots',
    status: 'untested',
    owner_plan: '062',
    python_equivalent: 'admin/product_manager/history_store.py',
  },
  {
    id: 'parity-sync',
    scenario: 'Remote sync push/pull with conflicts',
    status: 'untested',
    owner_plan: '064',
    python_equivalent: 'admin/product_manager/sync.py',
  },
  {
    id: 'parity-publication',
    scenario: 'Preflight, commit, push with recovery',
    status: 'untested',
    owner_plan: '058',
    python_equivalent: 'admin/product_manager/deploy.py',
  },
  {
    id: 'parity-media',
    scenario: 'Upload, transform, and apply media',
    status: 'untested',
    owner_plan: '063',
    python_equivalent: 'admin/product_manager/image_fallbacks.py',
  },
  {
    id: 'parity-undo',
    scenario: 'Durable undo/redo after restart',
    status: 'untested',
    owner_plan: '062',
    python_equivalent: 'admin/product_manager services undo',
  },
  {
    id: 'parity-backup',
    scenario: 'Bounded backup listing and restore',
    status: 'untested',
    owner_plan: '067',
    python_equivalent: 'admin/product_manager backup paths',
  },
  {
    id: 'parity-storefront',
    scenario: 'Storefront curation with validation',
    status: 'untested',
    owner_plan: '066',
    python_equivalent: 'admin/product_manager/ui/storefront_dialogs.py',
  },
  {
    id: 'parity-diagnostics',
    scenario: 'Doctor/integrity checks and repair',
    status: 'untested',
    owner_plan: '061',
    python_equivalent: 'admin/product_manager integrity checks',
  },
  {
    id: 'parity-preferences',
    scenario: 'Persisted preferences and keyboard shortcuts',
    status: 'untested',
    owner_plan: '061',
    python_equivalent: 'admin/product_manager/ui/theme.py',
  },
  {
    id: 'parity-security',
    scenario: 'Authenticated write boundary and token redaction',
    status: 'untested',
    owner_plan: '057',
    python_equivalent: 'N/A — new capability',
  },
];

const manualRows: EvidenceRow[] = [
  {
    id: 'manual-operator-acceptance',
    scenario: 'Operator acceptance walkthrough signed',
    status: 'manual',
    details: 'Requires maintainer sign-off after all automated evidence passes',
    owner_plan: '069',
  },
  {
    id: 'manual-rollback-drill',
    scenario: 'Rollback and failure recovery rehearsals',
    status: 'manual',
    details: 'Requires Git revert, restore, process kill/restart, and sync disconnect evidence',
    owner_plan: '069',
  },
];

function runAutomatedCheck(row: EvidenceRow): EvidenceRow {
  if (!row.test_command)
    return { ...row, status: 'untested', details: 'No test command configured' };
  console.log(`  Running: ${row.id} — ${row.test_command}`);
  const result = readTestOutput(row.test_command, adminDir);

  const evidenceDir = resolve(reportDir, 'evidence');
  mkdirSync(evidenceDir, { recursive: true });
  const evidencePath = resolve(reportDir, 'evidence', `${row.id}.json`);
  writeFileSync(
    evidencePath,
    JSON.stringify(
      {
        row_id: row.id,
        scenario: row.scenario,
        commit_sha: commitSha,
        timestamp: new Date().toISOString(),
        status: result.ok ? 'pass' : 'fail',
        command: row.test_command,
        output_snippet: result.output.slice(-4000),
      },
      null,
      2
    )
  );

  return {
    ...row,
    status: result.ok ? 'pass' : 'fail',
    evidence_path: `reports/certification/evidence/${row.id}.json`,
    details: result.ok ? undefined : result.output.slice(-500),
  };
}

console.log('=== Content Manager Certification Report ===');
console.log(`Commit: ${commitSha}`);
console.log(`Generated: ${new Date().toISOString()}\n`);

console.log('Automated checks:\n');
const executedRows: EvidenceRow[] = [];
for (const row of automatedRows) {
  const executed = runAutomatedCheck(row);
  const icon = executed.status === 'pass' ? '✅' : executed.status === 'fail' ? '❌' : '⚠️';
  console.log(`  ${icon} ${executed.id}: ${executed.status}`);
  if (executed.details) console.log(`     ${executed.details.split('\\n')[0]}`);
  executedRows.push(executed);
}

const allRows = [...executedRows, ...parityRows, ...manualRows];
const passCount = allRows.filter((r) => r.status === 'pass').length;
const failCount = allRows.filter((r) => r.status === 'fail').length;
const untestedCount = allRows.filter((r) => r.status === 'untested').length;
const manualCount = allRows.filter((r) => r.status === 'manual').length;
const stalenessCount = failCount + untestedCount;

const report: CertificationReport = {
  schema_version: 1,
  title: 'Certification Report — TypeScript Content Manager Migration',
  commit_sha: commitSha,
  generated_at: new Date().toISOString(),
  summary: {
    total: allRows.length,
    pass: passCount,
    fail: failCount,
    untested: untestedCount,
    manual: manualCount,
  },
  evidence_rows: allRows,
  exit_gate: {
    ready: failCount === 0 && untestedCount === 0,
    all_automated_pass: failCount === 0,
    zero_stale_evidence: stalenessCount === 0,
    maintainer_signature: null,
  },
  commands: {
    admin_validate: 'npm run admin:validate',
    admin_test: 'npm run admin:test',
    admin_typecheck: 'npm run admin:typecheck',
    admin_build: 'npm run admin:build',
    shadow_read: 'npm -w admin/content-manager run shadow-read',
    parity: 'npm -w admin/content-manager run parity',
    doctor: 'npm -w admin/content-manager run doctor',
  },
};

const reportPath = resolve(
  reportDir,
  `certification-${report.generated_at.replace(/[:.]/g, '-')}.json`
);
writeFileSync(reportPath, JSON.stringify(report, null, 2));

console.log(
  `\nSummary: ${report.summary.total} rows — ${passCount} pass, ${failCount} fail, ${untestedCount} untested, ${manualCount} manual`
);
console.log(`Exit gate ready: ${report.exit_gate.ready ? '✅ READY' : '❌ NOT READY'}`);
console.log(`All automated pass: ${report.exit_gate.all_automated_pass ? '✅' : '❌'}`);
console.log(`Zero stale evidence: ${report.exit_gate.zero_stale_evidence ? '✅' : '❌'}`);
console.log(`\nReport: ${reportPath}`);

if (!report.exit_gate.ready) {
  console.log('\n❌ Certification incomplete — fix failing/untested rows above');
  process.exit(1);
}

console.log('\n✅ Certification passed — all evidence rows green');
process.exit(0);
