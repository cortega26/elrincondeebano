// Plan 097 (deferred item): product media follows its category. Only paths
// under assets/images/<oldCategory>/ are moved; any failure rolls the moves
// back and keeps the original paths. Never touches canonical assets outside
// the image tree.

import { renameSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { resolve, dirname, sep } from 'node:path';

export interface RelocationResult {
  moved: Array<{ from: string; to: string }>;
  newImagePath: string;
  newAvifPath: string;
}

export function relocateProductMedia(
  repoRoot: string,
  product: { image_path?: string; image_avif_path?: string },
  opts: {
    previousCategory: string;
    previousImagePath: string;
    previousAvifPath: string;
    newCategory: string;
  }
): RelocationResult {
  const moved: Array<{ from: string; to: string }> = [];
  let newImagePath = opts.previousImagePath;
  let newAvifPath = opts.previousAvifPath;

  const relocateFile = (relativePath: string): string => {
    const expected = `assets/images/${opts.previousCategory}/`;
    if (!relativePath.startsWith(expected)) return relativePath;
    const fileName = relativePath.slice(expected.length);
    if (!fileName || fileName.includes('..')) return relativePath;
    const from = resolve(repoRoot, relativePath);
    if (!existsSync(from)) return relativePath;
    const toRelative = `assets/images/${opts.newCategory}/${fileName}`;
    const to = resolve(repoRoot, toRelative);
    if (to === from) return relativePath;
    if (existsSync(to)) return relativePath;
    // Plan 100: never rename outside the image tree — the category key is
    // the only variable segment and it must stay under assets/images/.
    const assetsRoot = resolve(repoRoot, 'assets/images') + sep;
    if (!to.startsWith(assetsRoot)) return relativePath;
    mkdirSync(dirname(to), { recursive: true });
    renameSync(from, to);
    moved.push({ from, to });
    return toRelative;
  };

  if (opts.previousImagePath) {
    newImagePath = relocateFile(opts.previousImagePath);
  }
  if (opts.previousAvifPath) {
    newAvifPath = relocateFile(opts.previousAvifPath);
  }

  return { moved, newImagePath, newAvifPath };
}

export function rollbackMediaRelocation(moved: Array<{ from: string; to: string }>): void {
  for (const { from, to } of moved.reverse()) {
    try {
      if (existsSync(to)) renameSync(to, from);
    } catch {
      // Best-effort rollback.
    }
  }
}

export function relocateFileForTest(
  repoRoot: string,
  relativePath: string,
  previousCategory: string,
  newCategory: string
): { moved: boolean; to?: string } {
  const result = relocateProductMedia(
    repoRoot,
    { image_path: relativePath },
    {
      previousCategory,
      previousImagePath: relativePath,
      previousAvifPath: '',
      newCategory,
    }
  );
  return { moved: result.moved.length > 0, to: result.newImagePath };
}

export { readdirSync };
