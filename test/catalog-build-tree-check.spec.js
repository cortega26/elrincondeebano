import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DERIVED_LOGO_ASSETS,
  classifyBuildChanges,
  readTrackedChanges,
  readUntrackedFiles,
  checkBuildTree,
} from '../tools/ci/catalog-build-tree-check.mjs';

function untrackedFilesInTempRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'catalog-build-tree-'));
  try {
    execFileSync('git', ['init', '-q'], { cwd: dir });
    writeFileSync(join(dir, '.gitignore'), 'reports/\n');
    execFileSync('git', ['add', '.gitignore'], { cwd: dir });
    mkdirSync(join(dir, 'assets'));
    writeFileSync(join(dir, 'assets', '__probe275.avif'), 'probe');
    mkdirSync(join(dir, 'reports'));
    writeFileSync(join(dir, 'reports', 'preflight.json'), '{}');
    return readUntrackedFiles(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('catalog build tree guard', () => {
  it('only exempts the eleven known Sharp-derived logo assets', () => {
    expect(DERIVED_LOGO_ASSETS.size).toBe(11);
    expect(classifyBuildChanges([...DERIVED_LOGO_ASSETS])).toEqual({
      ignored: [...DERIVED_LOGO_ASSETS],
      unexpected: [],
    });
  });

  it('fails closed for catalog/public projection drift alongside regenerated logos', () => {
    const drift = [
      'assets/images/web/favicon.ico',
      'data/product_data.json',
      'astro-poc/public/data/product_data.json',
      'astro-poc/src/data/products.json',
      'assets/images/web/unknown.webp',
      'astro-poc/src/components/ProductDetail.astro',
    ];
    expect(classifyBuildChanges(drift)).toEqual({
      ignored: ['assets/images/web/favicon.ico'],
      unexpected: drift.slice(1),
    });
  });

  it('reads staged and unstaged tracked changes from HEAD using NUL delimiters', () => {
    const observed = [];
    const fakeGit = (cmd, args, options) => {
      observed.push({ cmd, args, options });
      return Buffer.from('assets/images/web/logo.avif\0data/some file.json\0');
    };
    expect(readTrackedChanges('/tmp/example', fakeGit)).toEqual([
      'assets/images/web/logo.avif',
      'data/some file.json',
    ]);
    expect(observed[0].args).toEqual(['diff', '--name-only', '-z', 'HEAD', '--']);
    expect(observed[0].options.cwd).toBe('/tmp/example');
  });

  it('reads untracked non-ignored files from Git using NUL delimiters', () => {
    const observed = [];
    const fakeGit = (cmd, args, options) => {
      observed.push({ cmd, args, options });
      return Buffer.from(
        'assets/__probe275.avif\0assets/images/snacks_salados/Marco Polo 170g.avif\0'
      );
    };
    expect(readUntrackedFiles('/tmp/example', fakeGit)).toEqual([
      'assets/__probe275.avif',
      'assets/images/snacks_salados/Marco Polo 170g.avif',
    ]);
    expect(observed[0].args).toEqual(['ls-files', '--others', '--exclude-standard', '-z']);
    expect(observed[0].options.cwd).toBe('/tmp/example');
  });

  it('fails closed for untracked build artifacts while keeping the tracked allowlist', () => {
    const fakeGit = (cmd, args) => {
      if (args.includes('--others')) return Buffer.from('assets/__probe275.avif\0');
      return Buffer.from('assets/images/web/logo.avif\0');
    };
    expect(checkBuildTree({ cwd: '/tmp/example', git: fakeGit })).toEqual({
      ignored: ['assets/images/web/logo.avif'],
      unexpected: [],
      unexpectedUntracked: ['assets/__probe275.avif'],
    });
  });

  it('keeps untracked files excluded by .gitignore invisible', () => {
    expect(untrackedFilesInTempRepo()).toEqual(['assets/__probe275.avif']);
  });

  it('propagates Git errors instead of silently treating them as a clean tree', () => {
    expect(() =>
      checkBuildTree({
        git: () => {
          throw Error('not a git checkout');
        },
      })
    ).toThrow('not a git checkout');
  });
});
