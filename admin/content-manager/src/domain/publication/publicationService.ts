export interface PublicationManifest {
  ownedPaths: string[];
  requiredValidations: string[];
  commitMessage: string;
}

// Plan 197: domain-owned port for the git-change summary runPreflight reads.
// Satisfied structurally by GitAdapter.getChanges() on the adapter side —
// the domain no longer reaches into server/adapters/*, not even for types.
export interface GitChangeSummary {
  hasConflicts: boolean;
  dirty: boolean;
  staged: string[];
  unstaged: string[];
  untracked: string[];
  branch: string;
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

// A path belongs to the publication manifest when it matches an owned file
// exactly or lives under an owned directory (the trailing-slash guard keeps
// `assets/images-evil` from matching `assets/images/`).
export function isOwnedPath(filePath: string, ownedPaths: string[]): boolean {
  return ownedPaths.some((p) => filePath === p || filePath.startsWith(p.replace(/\/?$/, '/')));
}

// Everything the publication job may commit: staged, unstaged and untracked
// owned paths. The one-click sync uses this to decide whether there is
// anything to publish; unrelated dirty files must never trigger a commit.
export function catalogChanges(
  manifest: PublicationManifest,
  gitChanges: GitChangeSummary
): string[] {
  return [...gitChanges.staged, ...gitChanges.unstaged, ...gitChanges.untracked].filter((f) =>
    isOwnedPath(f, manifest.ownedPaths)
  );
}

export function runPreflight(
  manifest: PublicationManifest,
  gitChanges: GitChangeSummary
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

  const unrelatedStaged = gitChanges.staged.filter((f) => !isOwnedPath(f, manifest.ownedPaths));
  if (unrelatedStaged.length > 0) {
    errors.push(...unrelatedStaged.map((f) => `Unrelated staged file: ${f}`));
    checks.push({
      name: 'no-unrelated-staged',
      status: 'fail',
      message: `${unrelatedStaged.length} unrelated staged file(s)`,
    });
  } else {
    checks.push({
      name: 'no-unrelated-staged',
      status: 'pass',
      message: 'No unrelated staged files',
    });
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
