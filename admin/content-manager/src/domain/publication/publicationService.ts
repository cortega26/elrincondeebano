export interface PublicationManifest {
  ownedPaths: string[];
  requiredValidations: string[];
  commitMessage: string;
}

export interface PreflightResult {
  ok: boolean;
  checks: Array<{ name: string; status: 'pass' | 'warn' | 'fail'; message: string }>;
  errors: string[];
  warnings: string[];
}

export function createDefaultManifest(): PublicationManifest {
  return {
    ownedPaths: [
      'data/product_data.json',
      'data/category_registry.json',
      'data/categories.json',
      'astro-poc/src/data/storefront-experience.json',
      'astro-poc/src/data/storefront-bundles.json',
      'assets/images/',
    ],
    requiredValidations: [
      'products-schema',
      'category-schema',
      'storefront-schema',
      'no-unrelated-staged',
    ],
    commitMessage: 'chore(catalog): publication',
  };
}

export function runPreflight(
  _manifest: PublicationManifest,
  gitChanges: Awaited<
    ReturnType<typeof import('../../server/adapters/gitAdapter.ts').GitAdapter.prototype.getChanges>
  >
): PreflightResult {
  const checks: PreflightResult['checks'] = [];
  const errors: string[] = [];
  const warnings: string[] = [];

  if (gitChanges.hasConflicts) {
    errors.push('Repository has merge conflicts. Resolve before publishing.');
    checks.push({ name: 'no-conflicts', status: 'fail', message: 'Merge conflicts detected' });
  } else {
    checks.push({ name: 'no-conflicts', status: 'pass', message: 'No merge conflicts' });
  }

  if (gitChanges.dirty) {
    checks.push({
      name: 'dirty-check',
      status: 'warn',
      message: `${gitChanges.staged.length + gitChanges.unstaged.length + gitChanges.untracked.length} changes pending`,
    });
    warnings.push('Repository has uncommitted changes.');
  } else {
    checks.push({ name: 'dirty-check', status: 'pass', message: 'Working tree clean' });
  }

  if (!gitChanges.branch || gitChanges.branch === '?') {
    errors.push('Cannot determine current branch.');
    checks.push({ name: 'branch', status: 'fail', message: 'Unknown branch' });
  } else {
    checks.push({ name: 'branch', status: 'pass', message: `On branch: ${gitChanges.branch}` });
  }

  return {
    ok: errors.length === 0,
    checks,
    errors,
    warnings,
  };
}
