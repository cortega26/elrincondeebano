import { readdirSync, statSync, existsSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import {
  isSafeMediaPath,
  isValidMediaExtension,
  VALID_IMAGE_EXTENSIONS,
  type MediaItem,
} from '../../shared/schemas/media.ts';
import type { Product } from '../../shared/schemas/product.ts';

export interface MediaRepositoryConfig {
  repoRoot: string;
  assetsDir?: string;
}

const DEFAULT_ASSETS = 'assets/images';

// Plan 152: MediaRepository intentionally stays off JsonFileRepository — its
// cache is a directory-walk (max mtime + total size + productsKey) over
// ~4000 files, not a single JSON file's mtime+size. That walk + productsKey
// invalidation does not map onto the single-file base without behavior
// change, so it remains separate (see plan 148).

export class MediaRepository {
  private readonly assetsPath: string;
  private readonly repoRoot: string;
  private cached: {
    mtimeMs: number;
    size: number;
    items: MediaItem[];
    summary: Record<string, number>;
    productsKey: string;
  } | null = null;

  constructor(config: MediaRepositoryConfig) {
    this.repoRoot = config.repoRoot;
    this.assetsPath = resolve(config.repoRoot, config.assetsDir ?? DEFAULT_ASSETS);
  }

  invalidate(): void {
    this.cached = null;
  }

  private computeProductsKey(products: Product[]): string {
    const imagePaths = products.map((p) => p.image_path ?? '').sort().join('|');
    const avifPaths = products.map((p) => p.image_avif_path ?? '').sort().join('|');
    return `${products.length}:${imagePaths}:${avifPaths}`;
  }

  private getStamp(): { mtimeMs: number; size: number } | null {
    try {
      const stat = statSync(this.assetsPath);
      let maxMtime = stat.mtimeMs;
      let totalSize = stat.size;
      // Detect nested adds/removes: directory mtime changes propagate only to
      // the immediate parent. A file added deep in the tree updates its
      // parent dir's mtime but not the root. We walk the directory tree
      // (dirs only, not files) to collect the latest mtime — cheap: ~300 dirs
      // vs ~4000 files for a full walk.
      const stack: string[] = [this.assetsPath];
      while (stack.length > 0) {
        const dir = stack.pop()!;
        let entries;
        try {
          entries = readdirSync(dir, { withFileTypes: true });
        } catch {
          continue;
        }
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const full = resolve(dir, entry.name);
            try {
              const s = statSync(full);
              if (s.mtimeMs > maxMtime) maxMtime = s.mtimeMs;
              totalSize += s.size;
              stack.push(full);
            } catch {
              // ignore unreadable
            }
          }
        }
      }
      return { mtimeMs: maxMtime, size: totalSize };
    } catch {
      return null;
    }
  }

  getInventory(products: Product[]): { items: MediaItem[]; summary: Record<string, number> } {
    const productsKey = this.computeProductsKey(products);
    const stamp = this.getStamp();
    if (stamp && this.cached && this.cached.mtimeMs === stamp.mtimeMs && this.cached.size === stamp.size && this.cached.productsKey === productsKey) {
      return { items: this.cached.items, summary: this.cached.summary };
    }

    const usedPaths = new Set<string>();
    const productByPath = new Map<string, string>();

    for (const p of products) {
      if (p.image_path) {
        const rel = this.makeRelative(p.image_path);
        usedPaths.add(rel);
        productByPath.set(rel, p.name);
      }
      if (p.image_avif_path) {
        const rel = this.makeRelative(p.image_avif_path);
        usedPaths.add(rel);
      }
    }

    const diskPaths = new Set<string>();
    const items: MediaItem[] = [];

    try {
      this.walkDir(this.assetsPath, (relPath) => {
        diskPaths.add(relPath);
        const absPath = resolve(this.assetsPath, relPath);
        let size = 0;
        try {
          size = statSync(absPath).size;
        } catch {
          /* ignore */
        }

        const ext = relPath.includes('.') ? `.${relPath.split('.').pop()?.toLowerCase()}` : '';
        const isUsed = usedPaths.has(relPath);

        items.push({
          path: relPath,
          name: relPath.split('/').pop() ?? relPath,
          size,
          ext,
          status: isUsed ? 'active' : 'orphan',
          productName: productByPath.get(relPath),
        });
      });
    } catch {
      // Assets dir may not exist — return empty
    }

    for (const usedPath of usedPaths) {
      if (!diskPaths.has(usedPath)) {
        items.push({
          path: usedPath,
          name: usedPath.split('/').pop() ?? usedPath,
          size: 0,
          ext: usedPath.includes('.') ? `.${usedPath.split('.').pop()?.toLowerCase()}` : '',
          status: 'missing',
          productName: productByPath.get(usedPath),
        });
      }
    }

    // Single-pass summary instead of 4 .filter() passes.
    let active = 0;
    let orphans = 0;
    let generated = 0;
    let staged = 0;
    let missing = 0;
    for (const item of items) {
      if (item.status === 'active') active += 1;
      else if (item.status === 'orphan') orphans += 1;
      else if (item.status === 'generated') generated += 1;
      else if (item.status === 'staged') staged += 1;
      else if (item.status === 'missing') missing += 1;
    }
    const summary = {
      total: items.length,
      active,
      orphans,
      generated,
      staged,
      missing,
    };

    if (stamp) {
      this.cached = { mtimeMs: stamp.mtimeMs, size: stamp.size, productsKey, items, summary };
    }
    return { items, summary };
  }

  validatePath(path: string): { ok: boolean; error?: string } {
    const normalized = path.replace(/\\/g, '/');

    if (!isSafeMediaPath(normalized)) {
      return {
        ok: false,
        error: `Unsafe path: "${path}". Must be under assets/images/ and not contain ".."`,
      };
    }

    if (!isValidMediaExtension(normalized)) {
      const allowed = [...VALID_IMAGE_EXTENSIONS].join(', ');
      return { ok: false, error: `Invalid extension. Allowed: ${allowed}` };
    }

    const absPath = resolve(this.repoRoot, normalized);
    if (!absPath.startsWith(this.repoRoot)) {
      return { ok: false, error: `Path traversal detected: "${path}"` };
    }

    return { ok: true };
  }

  resolveFullPath(relativePath: string): string {
    return resolve(this.repoRoot, relativePath);
  }

  exists(relativePath: string): boolean {
    return existsSync(resolve(this.repoRoot, relativePath));
  }

  private makeRelative(mediaPath: string): string {
    if (mediaPath.startsWith('assets/images/')) {
      return mediaPath.slice('assets/images/'.length);
    }
    if (mediaPath.startsWith('assets/')) return mediaPath;

    const absPath = resolve(this.repoRoot, mediaPath);
    const rel = relative(this.assetsPath, absPath).replace(/\\/g, '/');
    if (rel.startsWith('..')) {
      return relative(this.repoRoot, absPath).replace(/\\/g, '/');
    }
    return rel;
  }

  private walkDir(dir: string, visitor: (relPath: string) => void): void {
    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = resolve(dir, entry.name);
        if (entry.isDirectory()) {
          this.walkDir(fullPath, visitor);
        } else if (entry.isFile()) {
          const relPath = relative(this.assetsPath, fullPath).replace(/\\/g, '/');
          visitor(relPath);
        }
      }
    } catch {
      // Skip directories we can't read
    }
  }
}
