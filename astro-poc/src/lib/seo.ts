import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const SITE_ORIGIN = 'https://www.elrincondeebano.com';
export const SITE_NAME = 'El Rincón de Ébano';
const HOME_OG_IMAGE_PATH = '/assets/images/og/home.og.jpg';
const DEFAULT_REPO_ROOT = path.resolve(process.cwd(), '..');

type OgManifestItem = {
  jpg?: {
    file?: string;
    sha256?: string;
  };
};

type SeoFileOptions = {
  repoRoot?: string;
};

const categoryOgManifestCache = new Map<string, Record<string, OgManifestItem>>();

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

export function publicAssetUrl(pathOrUrl: string): string {
  if (!pathOrUrl) {
    return '/';
  }
  if (/^https?:\/\//i.test(pathOrUrl)) {
    return pathOrUrl;
  }
  return normalizePath(pathOrUrl);
}

function resolveRepoRoot(options?: SeoFileOptions): string {
  return path.resolve(options?.repoRoot || DEFAULT_REPO_ROOT);
}

function repoAssetPath(assetPath: string, options?: SeoFileOptions): string {
  return path.resolve(resolveRepoRoot(options), assetPath.replace(/^\/+/, ''));
}

function versionTokenFromFile(assetPath: string, options?: SeoFileOptions): string | null {
  const filePath = repoAssetPath(assetPath, options);
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

function loadCategoryOgManifest(options?: SeoFileOptions): Record<string, OgManifestItem> {
  const manifestPath = path.resolve(
    resolveRepoRoot(options),
    'assets',
    'images',
    'og',
    'categories',
    '.og_manifest.json'
  );
  if (categoryOgManifestCache.has(manifestPath)) {
    return categoryOgManifestCache.get(manifestPath) || {};
  }

  let parsedItems: Record<string, OgManifestItem> = {};
  if (fs.existsSync(manifestPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      parsedItems = parsed?.items || {};
    } catch {
      parsedItems = {};
    }
  }

  categoryOgManifestCache.set(manifestPath, parsedItems);
  return parsedItems;
}

export function getCategoryOgImageUrl(categorySlug: string, options?: SeoFileOptions): string {
  const slug = String(categorySlug || '')
    .trim()
    .toLowerCase();
  if (!slug) {
    return DEFAULT_OG_IMAGE;
  }

  const categoryOgManifest = loadCategoryOgManifest(options);
  const candidateFile = categoryOgManifest?.[slug]?.jpg?.file;
  if (typeof candidateFile === 'string' && candidateFile.trim()) {
    const candidatePath = `/assets/images/og/categories/${candidateFile}`;
    const liveVersionToken = versionTokenFromFile(candidatePath, options);
    if (liveVersionToken) {
      return withVersionQuery(candidatePath, liveVersionToken);
    }
  }

  const fallbackPath = path.resolve(
    resolveRepoRoot(options),
    'assets',
    'images',
    'og',
    'categories',
    `${slug}.jpg`
  );
  if (fs.existsSync(fallbackPath)) {
    return withVersionQuery(
      `/assets/images/og/categories/${slug}.jpg`,
      versionTokenFromFile(`/assets/images/og/categories/${slug}.jpg`, options)
    );
  }

  return DEFAULT_OG_IMAGE;
}

function isSupportedOgImagePath(pathOrUrl: string): boolean {
  const rawValue = String(pathOrUrl || '').trim();
  if (!rawValue) {
    return false;
  }

  let pathname = rawValue;
  if (/^https?:\/\//i.test(rawValue)) {
    pathname = new URL(rawValue).pathname;
  }

  return /\.(?:jpe?g|png)$/i.test(pathname);
}

export function getProductOgImageUrl(
  imagePath: string | undefined,
  categorySlug?: string,
  options?: SeoFileOptions
): string {
  const normalizedImagePath = String(imagePath || '').trim();
  if (normalizedImagePath && isSupportedOgImagePath(normalizedImagePath)) {
    if (/^https?:\/\//i.test(normalizedImagePath)) {
      return absoluteUrl(normalizedImagePath);
    }

    const normalizedAssetPath = normalizePath(normalizedImagePath);
    return withVersionQuery(normalizedAssetPath, versionTokenFromFile(normalizedAssetPath, options));
  }

  const categoryOgImageUrl = getCategoryOgImageUrl(String(categorySlug || '').trim(), options);
  if (categoryOgImageUrl !== DEFAULT_OG_IMAGE) {
    return categoryOgImageUrl;
  }

  return DEFAULT_OG_IMAGE;
}
