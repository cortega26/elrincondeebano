import fs from 'node:fs';
import path from 'node:path';

export const SITE_ORIGIN = 'https://elrincondeebano.com';
export const SITE_NAME = 'El Rincón de Ébano';
export const DEFAULT_OG_IMAGE = `${SITE_ORIGIN}/assets/images/web/logo.webp`;

let categoryOgManifest: Record<string, { jpg?: { file?: string } }> | null = null;

function normalizePath(value: string): string {
  if (!value) {
    return '/';
  }
  return value.startsWith('/') ? value : `/${value}`;
}

export function absoluteUrl(pathOrUrl: string): string {
  if (!pathOrUrl) {
    return SITE_ORIGIN;
  }
  if (/^https?:\/\//i.test(pathOrUrl)) {
    return pathOrUrl;
  }
  return `${SITE_ORIGIN}${normalizePath(pathOrUrl)}`;
}

export function getCategoryOgImageUrl(categorySlug: string): string {
  const slug = String(categorySlug || '').trim().toLowerCase();
  if (!slug) {
    return DEFAULT_OG_IMAGE;
  }

  if (!categoryOgManifest) {
    const manifestPath = path.resolve(
      process.cwd(),
      '..',
      'assets',
      'images',
      'og',
      'categories',
      '.og_manifest.json'
    );
    if (fs.existsSync(manifestPath)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        categoryOgManifest = parsed?.items || {};
      } catch {
        categoryOgManifest = {};
      }
    } else {
      categoryOgManifest = {};
    }
  }

  const candidateFile = categoryOgManifest?.[slug]?.jpg?.file;
  if (typeof candidateFile === 'string' && candidateFile.trim()) {
    return `${SITE_ORIGIN}/assets/images/og/categories/${candidateFile}`;
  }

  const fallbackPath = path.resolve(
    process.cwd(),
    '..',
    'assets',
    'images',
    'og',
    'categories',
    `${slug}.jpg`
  );
  if (fs.existsSync(fallbackPath)) {
    return `${SITE_ORIGIN}/assets/images/og/categories/${slug}.jpg`;
  }

  return DEFAULT_OG_IMAGE;
}

export function getProductOgImageUrl(imagePath: string | undefined): string {
  if (!imagePath || !imagePath.trim()) {
    return DEFAULT_OG_IMAGE;
  }
  return absoluteUrl(imagePath.replace(/^\/+/, '/'));
}
