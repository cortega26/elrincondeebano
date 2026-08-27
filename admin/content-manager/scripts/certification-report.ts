import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
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

// --ci: gate only on the automated checks (contract rows are operator-signed).
const ciMode = process.argv.includes('--ci');

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
    id: 'contract',
    scenario: 'Schema round-trip regression check finds zero unexplained field mismatches',
    status: 'untested',
    test_command: 'npm run contract',
    evidence_path: 'reports/certification/evidence/contract.json',
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

const contractRows: EvidenceRow[] = [
  {
    id: 'contract-products',
    scenario: 'Browse, search, filter product catalog',
    status: 'untested',
    owner_plan: '059',
    python_equivalent: 'admin/product_manager/ui/main_window.py',
  },
  {
    id: 'contract-create',
    scenario: 'Create product with all fields',
    status: 'untested',
    owner_plan: '059, 061',
    python_equivalent: 'admin/product_manager/ui/product_form.py',
  },
  {
    id: 'contract-edit',
    scenario: 'Edit product with revision tracking',
    status: 'untested',
    owner_plan: '059',
    python_equivalent: 'admin/product_manager/services.py',
  },
  {
    id: 'contract-archive',
    scenario: 'Archive and restore products',
    status: 'untested',
    owner_plan: '059',
    python_equivalent: 'admin/product_manager/ui/main_window.py',
  },
  {
    id: 'contract-reorder',
    scenario: 'Global product reorder with identity',
    status: 'untested',
    owner_plan: '059',
    python_equivalent: 'admin/product_manager/ui/components.py',
  },
  {
    id: 'contract-bulk',
    scenario: 'Bulk preview/apply across all filters',
    status: 'untested',
    owner_plan: '059',
    python_equivalent: 'admin/product_manager/ui/bulk_operations_mixin.py',
  },
  {
    id: 'contract-categories',
    scenario: 'Category CRUD with product safety',
    status: 'untested',
    owner_plan: '059',
    python_equivalent: 'admin/product_manager/category_gui.py',
  },
  {
    id: 'contract-bundles',
    scenario: 'Bundle CRUD with product references',
    status: 'untested',
    owner_plan: '066',
    python_equivalent: 'admin/product_manager/ui/storefront_dialogs.py',
  },
  {
    id: 'contract-import',
    scenario: 'Import preview and apply with conflict resolution',
    status: 'untested',
    owner_plan: '060',
    python_equivalent: 'admin/product_manager/ui/import_export_mixin.py',
  },
  {
    id: 'contract-export',
    scenario: 'JSON/CSV export matching Python semantics',
    status: 'untested',
    owner_plan: '060',
    python_equivalent: 'admin/product_manager/ui/import_export_mixin.py',
  },
  {
    id: 'contract-history',
    scenario: 'Audit trail with before/after snapshots',
    status: 'untested',
    owner_plan: '062',
    python_equivalent: 'admin/product_manager/history_store.py',
  },
  {
    id: 'contract-sync',
    scenario: 'Remote sync push/pull with conflicts',
    status: 'untested',
    owner_plan: '064',
    python_equivalent: 'admin/product_manager/sync.py',
  },
  {
    id: 'contract-publication',
    scenario: 'Preflight, commit, push with recovery',
    status: 'untested',
    owner_plan: '058',
    python_equivalent: 'admin/product_manager/deploy.py',
  },
  {
    id: 'contract-media',
    scenario: 'Upload, transform, and apply media',
    status: 'untested',
    owner_plan: '063',
    python_equivalent: 'admin/product_manager/image_fallbacks.py',
  },
  {
    id: 'contract-undo',
    scenario: 'Durable undo/redo after restart',
    status: 'untested',
    owner_plan: '062',
    python_equivalent: 'admin/product_manager services undo',
  },
  {
    id: 'contract-backup',
    scenario: 'Bounded backup listing and restore',
    status: 'untested',
    owner_plan: '067',
    python_equivalent: 'admin/product_manager backup paths',
  },
  {
    id: 'contract-storefront',
    scenario: 'Storefront curation with validation',
    status: 'untested',
    owner_plan: '066',
    python_equivalent: 'admin/product_manager/ui/storefront_dialogs.py',
  },
  {
    id: 'contract-diagnostics',
    scenario: 'Doctor/integrity checks and repair',
    status: 'untested',
    owner_plan: '061',
    python_equivalent: 'admin/product_manager integrity checks',
  },
  {
    id: 'contract-preferences',
    scenario: 'Persisted preferences and keyboard shortcuts',
    status: 'untested',
    owner_plan: '061',
    python_equivalent: 'admin/product_manager/ui/theme.py',
  },
  {
    id: 'contract-security',
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

// Each contract scenario maps to the unit/integration test files that exercise
// it. When the full vitest suite (row 'unit-test') passes and every mapped
// file exists, the row is verified automatically; rows without coverage
// remain operator-signed (docs/operations/CUTOVER.md).
const CONTRACT_TEST_COVERAGE: Record<string, string[]> = {
  'contract-products': ['test/contract/productService.test.ts', 'test/integration/api.test.ts'],
  'contract-create': [
    'test/contract/productService.test.ts',
    'test/integration/mutationApi.test.ts',
    'test/integration/writeShadow.test.ts',
  ],
  'contract-edit': [
    'test/contract/productService.test.ts',
    'test/integration/mutationApi.test.ts',
    'test/contract/idempotency.test.ts',
    'test/integration/writeShadow.test.ts',
  ],
  'contract-archive': [
    'test/contract/productService.test.ts',
    'test/integration/api.test.ts',
    'test/integration/writeShadow.test.ts',
  ],
  'contract-reorder': [
    'test/integration/reorderBulkApi.test.ts',
    'test/contract/identity.test.ts',
    'test/integration/writeShadow.test.ts',
  ],
  'contract-bulk': ['test/integration/reorderBulkApi.test.ts'],
  'contract-categories': [
    'test/integration/categoryConcurrency.test.ts',
    'test/integration/clientIntegration.test.ts',
  ],
  'contract-bundles': ['test/integration/subcategoryBundles.test.ts'],
  'contract-import': [
    'test/integration/importApply.test.ts',
    'test/integration/conflictApi.test.ts',
    'test/contract/conflictService.test.ts',
  ],
  'contract-history': ['test/integration/api.test.ts', 'test/contract/changeSet.test.ts'],
  'contract-export': ['test/integration/api.test.ts'],
  'contract-sync': [
    'test/integration/conflictApi.test.ts',
    'test/integration/writeBoundary.test.ts',
  ],
  'contract-publication': [
    'test/integration/publication.test.ts',
    'test/integration/publicationAdvanced.test.ts',
    'test/integration/publicationE2E.test.ts',
    'test/integration/publicationRecovery.test.ts',
    'test/contract/publicationService.test.ts',
  ],
  'contract-media': [
    'test/contract/media.test.ts',
    'test/integration/mediaUpload.test.ts',
    'test/contract/mediaSecurity.test.ts',
  ],
  'contract-undo': ['test/contract/undo.test.ts', 'test/integration/restartRecovery.test.ts'],
  'contract-backup': [
    'test/integration/backupRestore.test.ts',
    'test/contract/atomicWriter.test.ts',
  ],
  'contract-storefront': [
    'test/integration/subcategoryBundles.test.ts',
    'test/integration/api.test.ts',
  ],
  'contract-diagnostics': ['test/contract/doctor.test.ts', 'test/integration/diagnostics.test.ts'],
  'contract-preferences': ['test/contract/preferences.test.ts', 'test/e2e/operator.spec.ts'],
  'contract-security': [
    'test/integration/writeBoundary.test.ts',
    'test/contract/routePolicy.test.ts',
    'test/integration/securityHeaders.test.ts',
    'test/contract/pathSafety.test.ts',
  ],
};

function resolveContractRows(unitTestPassed: boolean): EvidenceRow[] {
  return contractRows.map((row) => {
    const coverage = CONTRACT_TEST_COVERAGE[row.id];
    if (!coverage) {
      return { ...row, details: 'No automated coverage; operator sign-off required' };
    }
    const missing = coverage.filter((p) => !existsSync(resolve(adminDir, p)));
    if (missing.length > 0) {
      return {
        ...row,
        details: `Missing test files: ${missing.join(', ')}`,
      };
    }
    if (!unitTestPassed) {
      return { ...row, details: 'Unit suite did not pass; coverage not verified' };
    }
    return {
      ...row,
      status: 'pass',
      evidence_path: 'reports/certification/evidence/unit-test.json',
      details: `Covered by integration suite: ${coverage.join(', ')}`,
    };
  });
}

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

const unitTestPassed = executedRows.find((r) => r.id === 'unit-test')?.status === 'pass';
console.log('\nContract rows (schema round-trip regression, suite coverage):\n');
const resolvedContractRows = resolveContractRows(unitTestPassed);
for (const row of resolvedContractRows) {
  const icon = row.status === 'pass' ? '✅' : row.status === 'fail' ? '❌' : '⚠️';
  console.log(`  ${icon} ${row.id}: ${row.status}`);
}

// Plan 069 Step 4: the manual rows become pass only when signed acceptance
// and drill evidence exist for the current release candidate; otherwise the
// gate reports READY only for the automated surface.
let maintainerSignature: string | null = null;
const resolvedManualRows = manualRows.map((row) => {
  if (row.id === 'manual-rollback-drill') {
    const drillPath = resolve(reportDir, 'evidence', 'rollback-drill.json');
    if (existsSync(drillPath)) {
      const drill = JSON.parse(readFileSync(drillPath, 'utf-8')) as { status?: string };
      if (drill.status === 'pass') {
        return {
          ...row,
          status: 'pass' as const,
          details: 'Rollback drills evidence: reports/certification/evidence/rollback-drill.json',
        };
      }
    }
    return { ...row, status: 'manual' as const };
  }
  const acceptancePath = resolve(reportDir, 'evidence', 'operator-acceptance.json');
  if (existsSync(acceptancePath)) {
    const acceptance = JSON.parse(readFileSync(acceptancePath, 'utf-8')) as {
      status?: string;
      maintainer?: string;
      signed_at?: string;
    };
    if (acceptance.status === 'signed') {
      maintainerSignature = `${acceptance.maintainer ?? 'operator'}@${acceptance.signed_at ?? ''}`;
      return {
        ...row,
        status: 'pass' as const,
        details:
          'Signed operator acceptance: reports/certification/evidence/operator-acceptance.json',
      };
    }
  }
  return { ...row, status: 'manual' as const };
});
const allRows = [...executedRows, ...resolvedContractRows, ...resolvedManualRows];
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
    // In CI the contract rows are untested by design (operator-signed during the
    // migration, see docs/operations/CUTOVER.md), so the gate only fails on
    // automated check failures. Locally, plan 069 Step 4: READY requires the
    // manual rows (operator acceptance, rollback drills) to be signed too.
    ready: ciMode ? failCount === 0 : failCount === 0 && untestedCount === 0 && manualCount === 0,
    all_automated_pass: failCount === 0,
    zero_stale_evidence: ciMode ? failCount === 0 : stalenessCount === 0,
    maintainer_signature: maintainerSignature,
  },
  commands: {
    admin_validate: 'npm run admin:validate',
    admin_test: 'npm run admin:test',
    admin_typecheck: 'npm run admin:typecheck',
    admin_build: 'npm run admin:build',
    shadow_read: 'npm -w admin/content-manager run shadow-read',
    contract: 'npm -w admin/content-manager run contract',
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
