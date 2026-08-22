import { test, expect } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { GitAdapter } from '../../src/server/adapters/gitAdapter.ts';

function git(dir: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd: dir, encoding: 'utf-8' });
}

function makeCleanRepo(): { root: string; repoDir: string } {
  const root = resolve(
    tmpdir(),
    `cm-gitadapter-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  const repoDir = resolve(root, 'repo');
  mkdirSync(repoDir, { recursive: true });
  git(repoDir, 'init', '-q');
  git(repoDir, 'config', 'user.email', 'test@test.com');
  git(repoDir, 'config', 'user.name', 'Test');
  git(repoDir, 'branch', '-M', 'main');
  writeFileSync(resolve(repoDir, 'file.txt'), 'init\n');
  git(repoDir, 'add', '-A');
  git(repoDir, 'commit', '-qm', 'init');
  return { root, repoDir };
}

function makeWorkspace(): { root: string; appDir: string; bareDir: string } {
  const root = resolve(
    tmpdir(),
    `cm-gitadapter-ws-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  const bareDir = resolve(root, 'remote.git');
  const appDir = resolve(root, 'app');
  mkdirSync(bareDir, { recursive: true });
  git(bareDir, 'init', '--bare', '-q');
  mkdirSync(resolve(appDir, 'data'), { recursive: true });
  mkdirSync(resolve(appDir, 'astro-poc', 'src', 'data'), { recursive: true });
  writeFileSync(
    resolve(appDir, 'data', 'product_data.json'),
    JSON.stringify({ version: 'test', last_updated: '', rev: 0, products: [] })
  );
  writeFileSync(
    resolve(appDir, 'data', 'category_registry.json'),
    JSON.stringify({ nav_groups: [], categories: [] })
  );
  writeFileSync(
    resolve(appDir, 'astro-poc', 'src', 'data', 'storefront-experience.json'),
    JSON.stringify({
      trustBar: { highlights: [], statusItems: [] },
      home: {
        primaryCategories: [],
        secondaryCategories: [],
        fallbackQuickPicks: [],
        featuredStaples: [],
      },
      bundles: [],
      companionRules: [],
    })
  );
  git(appDir, 'init', '-q');
  git(appDir, 'config', 'user.email', 'test@test.com');
  git(appDir, 'config', 'user.name', 'Test');
  git(appDir, 'add', '-A');
  git(appDir, 'commit', '-qm', 'init');
  git(appDir, 'remote', 'add', 'origin', bareDir);
  git(appDir, 'branch', '-M', 'main');
  git(appDir, 'push', '-q', '-u', 'origin', 'main');
  git(bareDir, 'symbolic-ref', 'HEAD', 'refs/heads/main');
  return { root, appDir, bareDir };
}

test('getChanges reports no conflicts on a clean repo', async () => {
  const { root, repoDir } = makeCleanRepo();
  try {
    const adapter = new GitAdapter(repoDir);
    const changes = await adapter.getChanges();
    expect(changes.hasConflicts).toBe(false);
    expect(changes.ahead).toBe(0);
    expect(changes.behind).toBe(0);
    expect(changes.dirty).toBe(false);
    expect(changes.staged).toHaveLength(0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('getChanges detects AA merge conflict as hasConflicts true', async () => {
  const { root, repoDir } = makeCleanRepo();
  try {
    // Create a divergent AA conflict: both branches add the same file.
    git(repoDir, 'checkout', '-qb', 'feature');
    writeFileSync(resolve(repoDir, 'conflict.txt'), 'feature content\n');
    git(repoDir, 'add', '-A');
    git(repoDir, 'commit', '-qm', 'add conflict on feature');

    git(repoDir, 'checkout', '-q', 'main');
    writeFileSync(resolve(repoDir, 'conflict.txt'), 'main content\n');
    git(repoDir, 'add', '-A');
    git(repoDir, 'commit', '-qm', 'add conflict on main');

    git(repoDir, 'merge', 'feature', '--no-edit');
  } catch (_err) {
    void _err;
    // merge exits with conflict; expected
  }
  try {
    const statusOut = git(repoDir, 'status', '--porcelain', '--branch');
    // STOP condition: if porcelain format changed, fail loudly
    if (!statusOut.includes('AA conflict.txt')) {
      throw new Error(`Unexpected porcelain output for AA conflict: ${JSON.stringify(statusOut)}`);
    }
    const adapter = new GitAdapter(repoDir);
    const changes = await adapter.getChanges();
    expect(changes.hasConflicts).toBe(true);
    // AA appears as staged+unstaged in current classification; at least hasConflicts must be true
  } finally {
    try {
      git(repoDir, 'merge', '--abort');
    } catch (_err) {
      void _err;
    }
    rmSync(root, { recursive: true, force: true });
  }
});

test('getChanges detects UU merge conflict as hasConflicts true', async () => {
  const { root, repoDir } = makeCleanRepo();
  try {
    // Create a UU conflict: both sides modify the same file.
    git(repoDir, 'checkout', '-qb', 'branch-a');
    writeFileSync(resolve(repoDir, 'file.txt'), 'version A\n');
    git(repoDir, 'add', '-A');
    git(repoDir, 'commit', '-qm', 'modify on branch-a');

    git(repoDir, 'checkout', '-q', 'main');
    writeFileSync(resolve(repoDir, 'file.txt'), 'version B\n');
    git(repoDir, 'add', '-A');
    git(repoDir, 'commit', '-qm', 'modify on main');

    try {
      git(repoDir, 'merge', 'branch-a', '--no-edit');
    } catch (_err) {
      void _err;
    }
    const statusOut = git(repoDir, 'status', '--porcelain', '--branch');
    if (!statusOut.includes('UU file.txt')) {
      throw new Error(`Unexpected porcelain output for UU conflict: ${JSON.stringify(statusOut)}`);
    }
    const adapter = new GitAdapter(repoDir);
    const changes = await adapter.getChanges();
    expect(changes.hasConflicts).toBe(true);
  } finally {
    try {
      git(repoDir, 'merge', '--abort');
    } catch (_err2) {
      void _err2;
    }
    rmSync(root, { recursive: true, force: true });
  }
});

test('getChanges parses ahead count when local is ahead of origin', async () => {
  const { root, appDir } = makeWorkspace();
  try {
    writeFileSync(
      resolve(appDir, 'data', 'product_data.json'),
      JSON.stringify({ version: 'ahead', last_updated: '', rev: 1, products: [] })
    );
    git(appDir, 'add', '-A');
    git(appDir, 'commit', '-qm', 'local ahead');

    const statusOut = git(appDir, 'status', '--porcelain', '--branch');
    if (!statusOut.includes('[ahead 1]')) {
      throw new Error(`Unexpected header for ahead test: ${JSON.stringify(statusOut)}`);
    }

    const adapter = new GitAdapter(appDir);
    const changes = await adapter.getChanges();
    expect(changes.ahead).toBe(1);
    expect(changes.behind).toBe(0);
    expect(changes.hasConflicts).toBe(false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('getChanges parses behind count when remote is ahead after fetch', async () => {
  const { root, appDir, bareDir } = makeWorkspace();
  try {
    // Push a remote commit via a worker clone, then fetch in appDir
    const workerRoot = resolve(root, 'worker');
    const work = resolve(workerRoot, 'work');
    mkdirSync(workerRoot, { recursive: true });
    git(workerRoot, 'clone', '-q', bareDir, work);
    git(work, 'config', 'user.email', 'worker@test.com');
    git(work, 'config', 'user.name', 'Worker');
    writeFileSync(
      resolve(work, 'data', 'product_data.json'),
      JSON.stringify({ version: 'remote', last_updated: '', rev: 1, products: [] })
    );
    git(work, 'add', '-A');
    git(work, 'commit', '-qm', 'remote change');
    git(work, 'push', '-q', 'origin', 'main');

    git(appDir, 'fetch', '-q');
    const statusOut = git(appDir, 'status', '--porcelain', '--branch');
    if (!statusOut.includes('[behind 1]')) {
      throw new Error(`Unexpected header for behind test: ${JSON.stringify(statusOut)}`);
    }

    const adapter = new GitAdapter(appDir);
    const changes = await adapter.getChanges();
    expect(changes.behind).toBe(1);
    expect(changes.ahead).toBe(0);
    expect(changes.hasConflicts).toBe(false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('getChanges parses ahead and behind together', async () => {
  const { root, appDir, bareDir } = makeWorkspace();
  try {
    // Local ahead
    writeFileSync(
      resolve(appDir, 'data', 'product_data.json'),
      JSON.stringify({ version: 'local', last_updated: '', rev: 1, products: [] })
    );
    git(appDir, 'add', '-A');
    git(appDir, 'commit', '-qm', 'local ahead');

    // Remote ahead via worker
    const workerRoot = resolve(root, 'worker2');
    const work = resolve(workerRoot, 'work');
    mkdirSync(workerRoot, { recursive: true });
    git(workerRoot, 'clone', '-q', bareDir, work);
    git(work, 'config', 'user.email', 'worker@test.com');
    git(work, 'config', 'user.name', 'Worker');
    writeFileSync(
      resolve(work, 'data', 'product_data.json'),
      JSON.stringify({ version: 'remote2', last_updated: '', rev: 2, products: [] })
    );
    git(work, 'add', '-A');
    git(work, 'commit', '-qm', 'remote change 2');
    git(work, 'push', '-q', 'origin', 'main');

    git(appDir, 'fetch', '-q');
    const statusOut = git(appDir, 'status', '--porcelain', '--branch');
    if (!statusOut.includes('[ahead 1, behind 1]')) {
      throw new Error(`Unexpected header for ahead+behind test: ${JSON.stringify(statusOut)}`);
    }

    const adapter = new GitAdapter(appDir);
    const changes = await adapter.getChanges();
    expect(changes.ahead).toBe(1);
    expect(changes.behind).toBe(1);
    expect(changes.hasConflicts).toBe(false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
