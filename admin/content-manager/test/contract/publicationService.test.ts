import { test, expect } from 'vitest';
import {
  createDefaultManifest,
  runPreflight,
} from '../../src/domain/publication/publicationService.ts';

function makeGitChanges(
  overrides: Partial<{
    branch: string;
    dirty: boolean;
    staged: string[];
    unstaged: string[];
    untracked: string[];
    ahead: number;
    behind: number;
    hasConflicts: boolean;
  }> = {}
): Awaited<
  ReturnType<
    typeof import('../../src/server/adapters/gitAdapter.ts').GitAdapter.prototype.getChanges
  >
> {
  return {
    branch: 'main',
    dirty: false,
    staged: [],
    unstaged: [],
    untracked: [],
    ahead: 0,
    behind: 0,
    hasConflicts: false,
    ...overrides,
  };
}

test('runPreflight passes on clean state', () => {
  const manifest = createDefaultManifest();
  const changes = makeGitChanges();
  const result = runPreflight(manifest, changes);

  expect(result.ok).toBe(true);
  expect(result.errors).toHaveLength(0);

  const noConflicts = result.checks.find((c) => c.name === 'no-conflicts');
  expect(noConflicts!.status).toBe('pass');

  const dirty = result.checks.find((c) => c.name === 'dirty-check');
  expect(dirty!.status).toBe('pass');

  const branch = result.checks.find((c) => c.name === 'branch');
  expect(branch!.status).toBe('pass');
  expect(branch!.message).toContain('main');
});

test('runPreflight fails when conflicts exist', () => {
  const manifest = createDefaultManifest();
  const changes = makeGitChanges({ hasConflicts: true });
  const result = runPreflight(manifest, changes);

  expect(result.ok).toBe(false);
  expect(result.errors).toContain('Repository has merge conflicts. Resolve before publishing.');

  const noConflicts = result.checks.find((c) => c.name === 'no-conflicts');
  expect(noConflicts!.status).toBe('fail');
  expect(noConflicts!.message).toContain('Merge conflicts');
});

test('runPreflight warns on dirty working tree', () => {
  const manifest = createDefaultManifest();
  const changes = makeGitChanges({
    dirty: true,
    staged: ['data/product_data.json'],
    unstaged: ['data/category_registry.json'],
    untracked: ['new-file.md'],
  });
  const result = runPreflight(manifest, changes);

  expect(result.ok).toBe(true);

  const dirty = result.checks.find((c) => c.name === 'dirty-check');
  expect(dirty!.status).toBe('warn');
  expect(dirty!.message).toContain('3 changes pending');

  expect(result.warnings).toContain('Repository has uncommitted changes.');
});

test('runPreflight fails when branch is unknown', () => {
  const manifest = createDefaultManifest();
  const changes = makeGitChanges({ branch: '?' });
  const result = runPreflight(manifest, changes);

  expect(result.ok).toBe(false);
  expect(result.errors).toContain('Cannot determine current branch.');

  const branchCheck = result.checks.find((c) => c.name === 'branch');
  expect(branchCheck!.status).toBe('fail');
  expect(branchCheck!.message).toContain('Unknown branch');
});

test('runPreflight fails when branch is empty', () => {
  const manifest = createDefaultManifest();
  const changes = makeGitChanges({ branch: '' });
  const result = runPreflight(manifest, changes);

  expect(result.ok).toBe(false);
  expect(result.errors).toContain('Cannot determine current branch.');

  const branchCheck = result.checks.find((c) => c.name === 'branch');
  expect(branchCheck!.status).toBe('fail');
});

test('runPreflight handles both conflicts and unknown branch', () => {
  const manifest = createDefaultManifest();
  const changes = makeGitChanges({ hasConflicts: true, branch: '?' });
  const result = runPreflight(manifest, changes);

  expect(result.ok).toBe(false);
  expect(result.errors.length).toBeGreaterThanOrEqual(2);
});

test('runPreflight returns all four checks always', () => {
  const manifest = createDefaultManifest();
  const changes = makeGitChanges();
  const result = runPreflight(manifest, changes);

  expect(result.checks).toHaveLength(4);
  const names = result.checks.map((c) => c.name).sort();
  expect(names).toEqual(['branch', 'dirty-check', 'no-conflicts', 'no-unrelated-staged']);
});

test('runPreflight fails on unrelated staged file', () => {
  const manifest = createDefaultManifest();
  const changes = makeGitChanges({ staged: ['data/idempotency.json'] });
  const result = runPreflight(manifest, changes);

  expect(result.ok).toBe(false);
  expect(result.errors).toContain('Unrelated staged file: data/idempotency.json');

  const check = result.checks.find((c) => c.name === 'no-unrelated-staged');
  expect(check!.status).toBe('fail');
  expect(check!.message).toContain('1 unrelated staged file');
});

test('runPreflight passes when only owned paths are staged', () => {
  const manifest = createDefaultManifest();
  const changes = makeGitChanges({
    staged: [
      'data/product_data.json',
      'data/category_registry.json',
      'astro-poc/src/data/storefront-bundles.json',
    ],
  });
  const result = runPreflight(manifest, changes);

  expect(result.ok).toBe(true);

  const check = result.checks.find((c) => c.name === 'no-unrelated-staged');
  expect(check!.status).toBe('pass');
});

test('runPreflight covers staged files under assets/images/ prefix', () => {
  const manifest = createDefaultManifest();
  const changes = makeGitChanges({
    staged: ['assets/images/product-a.jpg', 'assets/images/nested/b.png'],
  });
  const result = runPreflight(manifest, changes);

  expect(result.ok).toBe(true);

  const check = result.checks.find((c) => c.name === 'no-unrelated-staged');
  expect(check!.status).toBe('pass');
});

test('runPreflight does not treat assets/images-evil as covered by assets/images/', () => {
  const manifest = createDefaultManifest();
  const changes = makeGitChanges({ staged: ['assets/images-evil/x.png'] });
  const result = runPreflight(manifest, changes);

  expect(result.ok).toBe(false);
  expect(result.errors).toContain('Unrelated staged file: assets/images-evil/x.png');
});

test('createDefaultManifest has expected structure', () => {
  const manifest = createDefaultManifest();

  expect(manifest.ownedPaths).toContain('data/product_data.json');
  expect(manifest.ownedPaths).toContain('data/category_registry.json');
  expect(manifest.ownedPaths).toContain('data/categories.json');
  expect(manifest.ownedPaths).toContain('astro-poc/src/data/storefront-experience.json');
  expect(manifest.requiredValidations).toContain('products-schema');
  expect(manifest.requiredValidations).toContain('category-schema');
  expect(manifest.requiredValidations).toContain('storefront-schema');
  expect(manifest.requiredValidations).toContain('no-unrelated-staged');
  expect(manifest.commitMessage).toBe('chore(catalog): publication');
});
