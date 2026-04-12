import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SITE_ORIGIN = 'https://www.elrincondeebano.com';
export const SITE_NAME = 'El Rincón de Ébano';
const HOME_OG_IMAGE_PATH = '/assets/images/og/home.og.jpg';
const MODULE_REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const DEFAULT_SHARE_DESCRIPTION =
  'Minimarket privado para residentes del edificio Ébano. Pedidos por WhatsApp y entrega dentro del edificio.';
const DEFAULT_OG_IMAGE_ALT = 'Logotipo de El Rincón de Ébano';
const DEFAULT_OG_TYPE = 'website';
const DEFAULT_TWITTER_CARD = 'summary_large_image';
const SHARE_DESCRIPTION_MAX_LENGTH = 180;

export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 1200;
export const OG_IMAGE_TYPE = 'image/jpeg';

type OgManifestItem = {
  jpg?: {
    file?: string;
    sha256?: string;
  };
};

type SeoFileOptions = {
  repoRoot?: string;
};

export type SharePreviewInput = {
  title: string;
  description?: string;
  canonicalPath?: string;
  canonicalUrl?: string;
  ogImage?: string;
  ogImageAlt?: string;
  ogType?: string;
  twitterCard?: string;
  repoRoot?: string;
};

export type SharePreviewMetadata = {
  title: string;
  description: string;
  canonicalUrl: string;
  ogUrl: string;
  ogImage: string;
  ogImageAlt: string;
  ogType: string;
  twitterCard: string;
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
  const explicit = options?.repoRoot;
  if (explicit) {
    return path.resolve(explicit);
  }

  const candidates = [
    process.cwd(),
    path.resolve(process.cwd(), '..'),
    MODULE_REPO_ROOT,
  ].map((candidate) => path.resolve(candidate));

  for (const candidate of candidates) {
    if (
      fs.existsSync(path.join(candidate, 'assets', 'images')) &&
      fs.existsSync(path.join(candidate, 'data'))
    ) {
      return candidate;
    }
  }

  return MODULE_REPO_ROOT;
}

function repoAssetPath(assetPath: string, options?: SeoFileOptions): string {
  return path.resolve(resolveRepoRoot(options), assetPath.replace(/^\/+/, ''));
}

function cleanDescriptionText(value: string): string {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeShareDescription(
  value: string | undefined,
  fallback = DEFAULT_SHARE_DESCRIPTION
): string {
  const normalizedFallback = cleanDescriptionText(fallback) || DEFAULT_SHARE_DESCRIPTION;
  const normalized = cleanDescriptionText(String(value || '')) || normalizedFallback;
  if (normalized.length <= SHARE_DESCRIPTION_MAX_LENGTH) {
    return normalized;
  }

  return `${normalized.slice(0, SHARE_DESCRIPTION_MAX_LENGTH - 3).trimEnd()}...`;
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
  const url = new URL(absolute);
  if (!versionToken) {
    url.searchParams.delete('v');
    return url.toString();
  }
  url.searchParams.set('v', versionToken);
  return url.toString();
}

function resolveOgAssetUrl(pathOrUrl: string | undefined, options?: SeoFileOptions): string {
  const rawValue = String(pathOrUrl || '').trim();
  if (!rawValue) {
    return withVersionQuery(HOME_OG_IMAGE_PATH, versionTokenFromFile(HOME_OG_IMAGE_PATH, options));
  }

  if (/^https?:\/\//i.test(rawValue)) {
    const parsed = new URL(rawValue);
    if (parsed.origin !== SITE_ORIGIN) {
      return parsed.toString();
    }
    return withVersionQuery(parsed.pathname, versionTokenFromFile(parsed.pathname, options));
  }

  const normalizedPath = normalizePath(rawValue);
  return withVersionQuery(normalizedPath, versionTokenFromFile(normalizedPath, options));
}

function getHomeOgImageUrl(options?: SeoFileOptions): string {
  return resolveOgAssetUrl(HOME_OG_IMAGE_PATH, options);
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

function getCategoryOgImageAssetPath(categorySlug: string, options?: SeoFileOptions): string {
  const slug = String(categorySlug || '')
    .trim()
    .toLowerCase();
  if (!slug) {
    return HOME_OG_IMAGE_PATH;
  }

  const categoryOgManifest = loadCategoryOgManifest(options);
  const candidateFile = categoryOgManifest?.[slug]?.jpg?.file;
  if (typeof candidateFile === 'string' && candidateFile.trim()) {
    const candidatePath = `/assets/images/og/categories/${candidateFile}`;
    if (versionTokenFromFile(candidatePath, options)) {
      return candidatePath;
    }
  }

  const fallbackPath = `/assets/images/og/categories/${slug}.jpg`;
  if (versionTokenFromFile(fallbackPath, options)) {
    return fallbackPath;
  }

  return HOME_OG_IMAGE_PATH;
}

export function getCategoryOgImageUrl(categorySlug: string, options?: SeoFileOptions): string {
  return resolveOgAssetUrl(getCategoryOgImageAssetPath(categorySlug, options), options);
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
    return resolveOgAssetUrl(normalizedImagePath, options);
  }

  const categoryOgImageUrl = getCategoryOgImageUrl(String(categorySlug || '').trim(), options);
  if (categoryOgImageUrl !== DEFAULT_OG_IMAGE) {
    return categoryOgImageUrl;
  }

  return DEFAULT_OG_IMAGE;
}

export function createSharePreviewMetadata({
  title,
  description,
  canonicalPath = '/',
  canonicalUrl,
  ogImage = DEFAULT_OG_IMAGE,
  ogImageAlt = DEFAULT_OG_IMAGE_ALT,
  ogType = DEFAULT_OG_TYPE,
  twitterCard = DEFAULT_TWITTER_CARD,
  repoRoot,
}: SharePreviewInput): SharePreviewMetadata {
  const normalizedDescription = normalizeShareDescription(description, DEFAULT_SHARE_DESCRIPTION);
  const resolvedCanonicalUrl = canonicalUrl || absoluteUrl(canonicalPath);
  const resolvedOgImage = resolveOgAssetUrl(ogImage, { repoRoot });

  return {
    title: String(title || '').trim(),
    description: normalizedDescription,
    canonicalUrl: resolvedCanonicalUrl,
    ogUrl: resolvedCanonicalUrl,
    ogImage: resolvedOgImage,
    ogImageAlt: cleanDescriptionText(ogImageAlt) || DEFAULT_OG_IMAGE_ALT,
    ogType: String(ogType || DEFAULT_OG_TYPE).trim() || DEFAULT_OG_TYPE,
    twitterCard: String(twitterCard || DEFAULT_TWITTER_CARD).trim() || DEFAULT_TWITTER_CARD,
  };
}
