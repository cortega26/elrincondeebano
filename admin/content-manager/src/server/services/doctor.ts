import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { RecoveryJournal } from './recoveryJournal.ts';

export interface DoctorReport {
  timestamp: string;
  nodeVersion: string;
  repoRoot: string;
  checks: Array<{
    name: string;
    status: 'ok' | 'warn' | 'error';
    message: string;
    remediation?: string;
  }>;
  summary: { ok: number; warn: number; error: number };
  recoveryNeeded: boolean;
}

// Plan 061 step 3: diagnostics must never leak secrets or machine-specific
// paths. The report is the only carrier (UI + downloadable evidence), so the
// redaction happens on the report itself: repoRoot -> basename, token-like
// values -> [REDACTED], credential-in-URL -> [REDACTED].
export function redactDoctorReport(report: DoctorReport): DoctorReport {
  const scrub = (value: string): string =>
    value
      .replace(/https?:\/\/[^\s/@]+@/g, 'https://[REDACTED]@')
      .replace(/\b[A-Za-z0-9_-]{32,}\b/g, '[REDACTED]');

  return {
    ...report,
    repoRoot: report.repoRoot.split('/').slice(-1)[0] ?? report.repoRoot,
    checks: report.checks.map((check) => ({ ...check, message: scrub(check.message) })),
  };
}

export function runDoctor(repoRoot: string): DoctorReport {
  const checks: DoctorReport['checks'] = [];

  function addCheck(
    name: string,
    status: 'ok' | 'warn' | 'error',
    message: string,
    remediation?: string
  ): void {
    checks.push({ name, status, message, remediation });
  }

  // Node version
  const nodeVersion = process.version;
  const majorVersion = Number(nodeVersion.replace('v', '').split('.')[0]);
  addCheck('node-version', majorVersion >= 24 ? 'ok' : 'warn', `Node ${nodeVersion}`);

  // Repo root — never expose the absolute path in the report (plan 061).
  const repoBasename = repoRoot.split('/').slice(-1)[0] ?? repoRoot;
  addCheck('repo-root', existsSync(repoRoot) ? 'ok' : 'error', repoBasename);

  // Product data
  const productFile = resolve(repoRoot, 'data', 'product_data.json');
  if (existsSync(productFile)) {
    try {
      const raw = readFileSync(productFile, 'utf-8');
      const parsed = JSON.parse(raw);
      const productCount = parsed.products?.length ?? 0;
      addCheck('product-data', 'ok', `${productCount} products, rev=${parsed.rev ?? '?'}`);
    } catch (err) {
      addCheck('product-data', 'error', (err as Error).message);
    }
  } else {
    addCheck(
      'product-data',
      'error',
      'product_data.json not found',
      'Copia product_data.json al directorio data/'
    );
  }

  // Category registry
  const catFile = resolve(repoRoot, 'data', 'category_registry.json');
  if (existsSync(catFile)) {
    try {
      const raw = readFileSync(catFile, 'utf-8');
      const parsed = JSON.parse(raw);
      const catCount = parsed.categories?.length ?? 0;
      const groupCount = parsed.nav_groups?.length ?? 0;
      addCheck('category-registry', 'ok', `${catCount} categories, ${groupCount} groups`);
    } catch {
      addCheck('category-registry', 'warn', 'Invalid JSON in category_registry.json');
    }
  } else {
    addCheck('category-registry', 'warn', 'category_registry.json not found');
  }

  // Storefront experience
  const sfFile = resolve(repoRoot, 'astro-poc', 'src', 'data', 'storefront-experience.json');
  if (existsSync(sfFile)) {
    try {
      const raw = readFileSync(sfFile, 'utf-8');
      JSON.parse(raw);
      addCheck('storefront-experience', 'ok', 'storefront-experience.json valid');
    } catch {
      addCheck('storefront-experience', 'warn', 'Invalid JSON');
    }
  } else {
    addCheck('storefront-experience', 'warn', 'Not found');
  }

  // Assets directory
  const assetsDir = resolve(repoRoot, 'assets', 'images');
  if (existsSync(assetsDir)) {
    let fileCount = 0;
    try {
      fileCount = (readdirSync(assetsDir, { recursive: true }) as string[]).filter(
        (f) => !f.startsWith('.')
      ).length;
    } catch {
      /* ignore */
    }
    addCheck('assets-dir', 'ok', `${fileCount} files`);
  } else {
    addCheck('assets-dir', 'warn', 'assets/images/ not found');
  }

  // Backup files
  const csDir = resolve(repoRoot, 'data', 'change-sets');
  const dataDir = resolve(repoRoot, 'data');
  if (existsSync(dataDir)) {
    const backups = readdirSync(dataDir).filter((f: string) => f.includes('backup_'));
    addCheck('backups', 'ok', `${backups.length} backups`);
  }

  // Tmp files (stale temp files from interrupted writes)
  let tmpCount = 0;
  if (existsSync(dataDir)) {
    const tmpFiles = readdirSync(dataDir).filter((f: string) => f.endsWith('.tmp'));
    tmpCount = tmpFiles.length;
    addCheck(
      'tmp-files',
      tmpCount > 0 ? 'warn' : 'ok',
      `${tmpCount} stale .tmp files`,
      tmpCount > 0 ? 'Elimina los archivos .tmp obsoletos de data/' : undefined
    );
  }

  // Idempotency journal
  const idempotencyFile = resolve(repoRoot, 'data', 'idempotency.json');
  if (existsSync(idempotencyFile)) {
    try {
      const raw = readFileSync(idempotencyFile, 'utf-8');
      const parsed = JSON.parse(raw);
      const idempotencyCount = Array.isArray(parsed) ? parsed.length : Object.keys(parsed).length;
      addCheck('idempotency', 'ok', `${idempotencyCount} entries`);
    } catch {
      addCheck('idempotency', 'warn', 'Invalid JSON in idempotency.json');
    }
  } else {
    addCheck('idempotency', 'ok', 'No idempotency journal (no pending writes)');
  }

  // Change-sets directory (count JSON files)
  if (existsSync(csDir)) {
    const csFiles = readdirSync(csDir).filter((f: string) => f.endsWith('.json'));
    addCheck(
      'change-sets',
      csFiles.length > 0 ? 'warn' : 'ok',
      `${csFiles.length} change sets`,
      csFiles.length > 0
        ? 'Hay change sets pendientes: revísalos en la página de conflictos/historial'
        : undefined
    );
  }

  // Product data valid JSON with non-empty products array
  if (existsSync(productFile)) {
    try {
      const raw = readFileSync(productFile, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.products) && parsed.products.length > 0) {
        addCheck(
          'product-data-integrity',
          'ok',
          `Valid JSON with ${parsed.products.length} products`
        );
      } else {
        addCheck(
          'product-data-integrity',
          'warn',
          'product_data.json has empty or missing products array'
        );
      }
    } catch {
      addCheck('product-data-integrity', 'error', 'product_data.json is not valid JSON');
    }
  }

  // Stale .tmp files (interrupted before any rename) and unrecovered
  // journal failures (interrupted mid-rename, or a rename that threw and
  // couldn't restore) are two different symptoms of the same underlying
  // problem; either one means recovery is needed.
  const journal = new RecoveryJournal(repoRoot);
  const unrecoveredFailures = journal.getUnrecoveredFailures();
  if (unrecoveredFailures.length > 0) {
    addCheck(
      'recovery-journal',
      'error',
      `${unrecoveredFailures.length} unrecovered write failure(s): ${unrecoveredFailures.map((f) => f.targetFile).join(', ')}`,
      'Revisa el journal de recovery o restaura desde un backup (ver RUNBOOK / ROLLBACK)'
    );
  } else {
    addCheck('recovery-journal', 'ok', 'No unrecovered write failures');
  }

  const recoveryNeeded = tmpCount > 0 || unrecoveredFailures.length > 0;

  const ok = checks.filter((c) => c.status === 'ok').length;
  const warn = checks.filter((c) => c.status === 'warn').length;
  const error = checks.filter((c) => c.status === 'error').length;

  return {
    timestamp: new Date().toISOString(),
    nodeVersion,
    repoRoot,
    checks,
    summary: { ok, warn, error },
    recoveryNeeded,
  };
}
