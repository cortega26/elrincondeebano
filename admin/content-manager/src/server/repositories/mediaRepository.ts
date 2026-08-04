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

export class MediaRepository {
  private readonly assetsPath: string;
  private readonly repoRoot: string;

  constructor(config: MediaRepositoryConfig) {
    this.repoRoot = config.repoRoot;
    this.assetsPath = resolve(config.repoRoot, config.assetsDir ?? DEFAULT_ASSETS);
  }

  getInventory(products: Product[]): { items: MediaItem[]; summary: Record<string, number> } {
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

    const summary = {
      total: items.length,
      active: items.filter((i) => i.status === 'active').length,
      orphans: items.filter((i) => i.status === 'orphan').length,
      generated: items.filter((i) => i.status === 'generated').length,
      staged: items.filter((i) => i.status === 'staged').length,
      missing: items.filter((i) => i.status === 'missing').length,
    };

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
