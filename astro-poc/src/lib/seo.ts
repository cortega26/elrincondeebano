import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const SITE_ORIGIN = 'https://elrincondeebano.com';
export const SITE_NAME = 'El Rincón de Ébano';
const HOME_OG_IMAGE_PATH = '/assets/images/og/home.og.jpg';

type OgManifestItem = {
  jpg?: {
    file?: string;
    sha256?: string;
  };
};

let categoryOgManifest: Record<string, OgManifestItem> | null = null;

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

function repoAssetPath(assetPath: string): string {
  return path.resolve(process.cwd(), '..', assetPath.replace(/^\/+/, ''));
}

function versionTokenFromFile(assetPath: string): string | null {
  const filePath = repoAssetPath(assetPath);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return crypto.createHash('sha1').update(fs.readFileSync(filePath)).digest('hex').slice(0, 12);
}

function withVersionQuery(assetPath: string, versionToken: string | null): string {
  const absolute = absoluteUrl(assetPath);
  if (!versionToken) {
    return absolute;
  }
  const url = new URL(absolute);
  url.searchParams.set('v', versionToken);
  return url.toString();
}

function getHomeOgImageUrl(): string {
  return withVersionQuery(HOME_OG_IMAGE_PATH, versionTokenFromFile(HOME_OG_IMAGE_PATH));
}

export const DEFAULT_OG_IMAGE = getHomeOgImageUrl();

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
  const candidateHash = categoryOgManifest?.[slug]?.jpg?.sha256?.slice(0, 12) || null;
  if (typeof candidateFile === 'string' && candidateFile.trim()) {
    return withVersionQuery(`/assets/images/og/categories/${candidateFile}`, candidateHash);
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
    return withVersionQuery(`/assets/images/og/categories/${slug}.jpg`, versionTokenFromFile(`/assets/images/og/categories/${slug}.jpg`));
  }

  return DEFAULT_OG_IMAGE;
}

export function getProductOgImageUrl(imagePath: string | undefined): string {
  if (!imagePath || !imagePath.trim()) {
    return DEFAULT_OG_IMAGE;
  }
  return absoluteUrl(imagePath.replace(/^\/+/, '/'));
}
