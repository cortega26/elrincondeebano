import { describe, expect, it } from 'vitest';
import {
  DERIVED_LOGO_ASSETS,
  classifyBuildChanges,
  readTrackedChanges,
  checkBuildTree,
} from '../tools/ci/catalog-build-tree-check.mjs';

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

  it('propagates Git errors instead of silently treating them as a clean tree', () => {
    expect(() => checkBuildTree({ git: () => { throw Error('not a git checkout'); } })).toThrow(
      'not a git checkout'
    );
  });
});
