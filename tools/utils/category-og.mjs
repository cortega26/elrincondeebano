import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import {
  REPO_ROOT,
  ensureDir,
  writeTextIfChanged,
  writeBufferIfChanged,
  fileSha256,
} from './image-pipeline.mjs';

// ---------------------------------------------------------------------------
// Constants from template.py
// ---------------------------------------------------------------------------
export const TEMPLATE_VERSION = 'v3';
export const WIDTH = 1200;
export const HEIGHT = 1200;

function jpgVersionToken() {
  return `og_${TEMPLATE_VERSION.toLowerCase()}`;
}

const PALETTE = [
  ['#3A77E6', '#1A2A67'],
  ['#2D9A8B', '#154D4D'],
  ['#D1782A', '#6A2F10'],
  ['#6B56D4', '#2C1E67'],
  ['#BB557A', '#5B1F3A'],
  ['#5F8E3A', '#264419'],
  ['#7F6A49', '#3A2E1F'],
  ['#2A87B8', '#123A5B'],
];

const PALETTE_OVERRIDES = new Map([
  ['aguas', ['#4BA7F0', '#155A9A']],
  ['bebidas', ['#D94D32', '#6D241B']],
  ['carnesyembutidos', ['#B3552E', '#5A2615']],
  ['cervezas', ['#E0A122', '#7A4A07']],
  ['chocolates', ['#8D5A3A', '#3A2418']],
  ['comestibles', ['#8FB64D', '#39531E']],
  ['despensa', ['#6AA84F', '#2F5F27']],
  ['e', ['#2E7B7F', '#113E45']],
  ['energeticaseisotonicas', ['#14B8B1', '#0B3B4A']],
  ['espumantes', ['#C6A96A', '#6D5127']],
  ['juegos', ['#6A5AE0', '#2D236B']],
  ['jugos', ['#F08A24', '#8C3F10']],
  ['lacteos', ['#EFD8A3', '#8F6E33']],
  ['limpiezayaseo', ['#56A6D8', '#16435F']],
  ['llaveros', ['#5A6ACF', '#25306B']],
  ['mascotas', ['#D98B45', '#6B4020']],
  ['piscos', ['#C67B3D', '#6A3B18']],
  ['snacksdulces', ['#D05A91', '#5B2140']],
  ['snackssalados', ['#CFA328', '#665114']],
  ['software', ['#2B8CC4', '#103A5A']],
  ['vinos', ['#7B1E3A', '#2C0E1A']],
]);

function paletteForSlug(slug) {
  const normalized = String(slug || '')
    .trim()
    .toLowerCase();
  if (PALETTE_OVERRIDES.has(normalized)) {
    return PALETTE_OVERRIDES.get(normalized);
  }
  const digest = crypto.createHash('sha256').update(slug, 'utf8').digest('hex');
  const idx = parseInt(digest.slice(0, 8), 16) % PALETTE.length;
  return PALETTE[idx];
}

export function buildLabel(title, slug) {
  const source = String(title || slug || 'categoria')
    .trim()
    .toUpperCase();
  const normalized = source.replace(/\s+/g, ' ');
  return normalized || 'CATEGORIA';
}

function wrapLabelLines(label) {
  const compact = label.replace(/\s+/g, ' ').trim();
  if (!compact) {
    return ['CATEGORIA'];
  }
  if (compact.length <= 16) {
    return [compact];
  }
  const words = compact.split(' ');
  const targetChars = 14;
  const lines = [];
  let current = '';
  for (const word of words) {
    if (!current) {
      current = word;
      continue;
    }
    const candidate = `${current} ${word}`;
    if (candidate.length <= targetChars) {
      current = candidate;
      continue;
    }
    lines.push(current);
    current = word;
  }
  if (current) {
    lines.push(current);
  }
  return lines;
}

function labelStyleForLines(lines) {
  const count = Math.max(1, lines.length);
  const longest = Math.max(...lines.map((l) => l.length), 0);
  let fontSize;
  if (count <= 1) {
    fontSize = 70;
  } else if (count === 2) {
    fontSize = 52;
  } else {
    fontSize = 42;
  }
  if (longest > 16) {
    fontSize = Math.max(34, fontSize - (longest - 16) * 2);
  }
  const lineHeight = Math.floor(fontSize * 1.1);
  return [fontSize, lineHeight];
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderLabelTspans(lines, centerX, centerY, lineHeight) {
  const startY = centerY - ((lines.length - 1) * lineHeight) / 2;
  return lines
    .map((line, index) => {
      const y = startY + index * lineHeight;
      return `<tspan x="${centerX}" y="${y.toFixed(1)}">${escapeHtml(line)}</tspan>`;
    })
    .join('');
}

export function renderSvg({ slug, title, iconInnerSvg, iconName }) {
  const [colorA, colorB] = paletteForSlug(slug);
  const label = buildLabel(title, slug);
  const labelLines = wrapLabelLines(label);
  const [labelFontSize, labelLineHeight] = labelStyleForLines(labelLines);
  const labelTspans = renderLabelTspans(labelLines, WIDTH / 2, 946, labelLineHeight);
  let iconMarkup = iconInnerSvg;
  if (!iconMarkup.includes('currentColor')) {
    iconMarkup = iconMarkup.replaceAll('stroke="', 'stroke="#FFFFFF" ');
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" ` +
    `viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="${escapeHtml(label)}" ` +
    `data-template-version="${TEMPLATE_VERSION}" data-icon="${escapeHtml(iconName)}">` +
    '<defs>' +
    `<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0%" stop-color="${colorA}"/>` +
    `<stop offset="100%" stop-color="${colorB}"/>` +
    '</linearGradient>' +
    '<radialGradient id="halo" cx="0.5" cy="0.4" r="0.7">' +
    '<stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.18"/>' +
    '<stop offset="100%" stop-color="#FFFFFF" stop-opacity="0"/>' +
    '</radialGradient>' +
    '</defs>' +
    `<rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>` +
    `<circle cx="${WIDTH / 2}" cy="500" r="306" fill="none" stroke="#FFFFFF" stroke-opacity="0.18" stroke-width="12"/>` +
    `<circle cx="${WIDTH / 2}" cy="500" r="246" fill="none" stroke="#FFFFFF" stroke-opacity="0.30" stroke-width="4"/>` +
    `<circle cx="${WIDTH / 2}" cy="500" r="220" fill="#0E1A2E" fill-opacity="0.26"/>` +
    `<circle cx="${WIDTH / 2}" cy="500" r="320" fill="url(#halo)"/>` +
    `<g transform="translate(${WIDTH / 2} 500) scale(14) translate(-12 -12)" color="#FFFFFF" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">` +
    `${iconMarkup}` +
    '</g>' +
    '<rect x="255" y="868" width="690" height="156" rx="78" fill="#0E1A2E" fill-opacity="0.5"/>' +
    '<rect x="265" y="878" width="670" height="136" rx="68" fill="none" stroke="#FFFFFF" stroke-opacity="0.36" stroke-width="3"/>' +
    `<text x="${WIDTH / 2}" text-anchor="middle" fill="#FFFFFF" ` +
    `font-family="Arial Black, Arial, Helvetica, sans-serif" font-size="${labelFontSize}" ` +
    'font-weight="700" letter-spacing="2" dominant-baseline="middle" ' +
    'style="paint-order: stroke; stroke: rgba(10, 16, 28, 0.35); stroke-width: 2px;">' +
    `${labelTspans}</text>` +
    '<rect x="10" y="10" width="1180" height="1180" rx="24" fill="none" stroke="#FFFFFF" stroke-opacity="0.14" stroke-width="4"/>' +
    '</svg>'
  );
}

// ---------------------------------------------------------------------------
// Slug helpers (from slug.py)
// ---------------------------------------------------------------------------
export class SlugError extends Error {}

export function slugifyCategory(name) {
  if (typeof name !== 'string') {
    throw new SlugError('Category name must be a string.');
  }
  let normalized = name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  normalized = normalized.replace(/\s+/g, '_');
  normalized = normalized.replace(/[^a-z0-9_]/g, '');
  normalized = normalized.replace(/_+/g, '_').replace(/^_+|_+$/g, '');
  if (!normalized) {
    throw new SlugError('Category slug cannot be empty after normalization.');
  }
  return normalized;
}

export function isSlugSafe(slug) {
  return /^[a-z0-9_]+$/.test(String(slug || ''));
}

// ---------------------------------------------------------------------------
// Icon helpers (from icons.py)
// ---------------------------------------------------------------------------
function stripBom(text) {
  if (text.charCodeAt(0) === 0xfeff) {
    return text.slice(1);
  }
  return text;
}

export function loadIconMapping(configPath) {
  if (!fs.existsSync(configPath)) {
    throw new Error(`Icon mapping file not found: ${configPath}`);
  }
  const raw = JSON.parse(stripBom(fs.readFileSync(configPath, 'utf8')));
  const slugMap = {};
  for (const [k, v] of Object.entries(raw.slug_map || {})) {
    const key = String(k).trim().toLowerCase();
    const val = String(v).trim();
    if (key && val) slugMap[key] = val;
  }
  const keywordMap = {};
  for (const [k, v] of Object.entries(raw.keyword_map || {})) {
    const key = String(k).trim().toLowerCase();
    const val = String(v).trim();
    if (key && val) keywordMap[key] = val;
  }
  const defaultIcon = String(raw.default_icon || 'shapes').trim() || 'shapes';
  const version = String(raw.version || 'v1').trim() || 'v1';
  return { version, defaultIcon, slugMap, keywordMap };
}

export function resolveIconName(mapping, slug, title) {
  const normalizedSlug = String(slug || '')
    .trim()
    .toLowerCase();
  if (normalizedSlug in mapping.slugMap) {
    return mapping.slugMap[normalizedSlug];
  }
  const haystack = `${normalizedSlug} ${title || ''}`.toLowerCase();
  for (const [keyword, iconName] of Object.entries(mapping.keywordMap)) {
    if (keyword && haystack.includes(keyword)) {
      return iconName;
    }
  }
  return mapping.defaultIcon;
}

export function loadIconInnerSvg(iconName, iconsDir) {
  const iconPath = path.resolve(iconsDir, `${iconName}.svg`);
  if (!fs.existsSync(iconPath)) {
    throw new Error(`Icon not found: ${iconPath}`);
  }
  const raw = fs.readFileSync(iconPath, 'utf8');
  const match = raw.match(/<svg[^>]*>([\s\S]*?)<\/svg>/i);
  if (!match) {
    throw new Error(`Invalid icon SVG wrapper in ${iconPath}`);
  }
  const inner = match[1].trim();
  if (!inner) {
    throw new Error(`Icon has no drawable content: ${iconPath}`);
  }
  return inner;
}

// ---------------------------------------------------------------------------
// Path helpers (from paths.py)
// ---------------------------------------------------------------------------
export class UnsafePathError extends Error {}

export function repoRootFromHere() {
  return REPO_ROOT;
}

export function categoryAssetsDir(repoRoot) {
  return path.join(repoRoot, 'assets', 'images', 'og', 'categories');
}

export function iconAssetsDir(repoRoot) {
  return path.join(repoRoot, 'assets', 'images', 'og', 'icons');
}

export function manifestPath(repoRoot) {
  return path.join(categoryAssetsDir(repoRoot), '.og_manifest.json');
}

export function iconMapPath(repoRoot) {
  return path.join(repoRoot, 'config', 'category_og_icon_map.json');
}

const VERSION_TOKEN_RE = /^[a-z0-9_-]+$/;
const OVERRIDE_SUFFIXES = ['.png', '.jpg', '.jpeg', '.webp'];

export function safeSlugPath(baseDir, slug, suffix) {
  if (!isSlugSafe(slug)) {
    throw new UnsafePathError(`Invalid managed slug: ${slug}`);
  }
  if (!['.svg', '.jpg'].includes(suffix)) {
    throw new UnsafePathError(`Unsupported suffix: ${suffix}`);
  }
  const target = path.resolve(baseDir, `${slug}${suffix}`);
  const base = path.resolve(baseDir);
  if (!target.startsWith(base)) {
    throw new UnsafePathError(`Refusing to operate outside ${base}`);
  }
  return target;
}

export function safeVersionedJpgPath(baseDir, slug, versionToken) {
  if (!isSlugSafe(slug)) {
    throw new UnsafePathError(`Invalid managed slug: ${slug}`);
  }
  if (!VERSION_TOKEN_RE.test(versionToken)) {
    throw new UnsafePathError(`Invalid JPG version token: ${versionToken}`);
  }
  const target = path.resolve(baseDir, `${slug}.${versionToken}.jpg`);
  const base = path.resolve(baseDir);
  if (!target.startsWith(base)) {
    throw new UnsafePathError(`Refusing to operate outside ${base}`);
  }
  return target;
}

export function findOverrideRasterPath(baseDir, slug) {
  if (!isSlugSafe(slug)) {
    throw new UnsafePathError(`Invalid managed slug: ${slug}`);
  }
  const base = path.resolve(baseDir);
  for (const suffix of OVERRIDE_SUFFIXES) {
    const target = path.resolve(baseDir, `${slug}.override${suffix}`);
    if (!target.startsWith(base)) {
      throw new UnsafePathError(`Refusing to operate outside ${base}`);
    }
    if (fs.existsSync(target)) {
      return target;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Renderer — direct sharp (no subprocess per image, fixes PERF-06)
// ---------------------------------------------------------------------------
export class RenderError extends Error {}

export async function renderSvgToJpg({
  svgPath,
  jpgPath,
  width = WIDTH,
  height = HEIGHT,
  quality = 88,
}) {
  // Mirrors tools/category_og/render_jpg.mjs logic but in-process
  const svgBuffer = fs.readFileSync(svgPath);
  // Use density 300 as in original render_jpg.mjs
  const buffer = await sharp(svgBuffer, { density: 300 })
    .resize(width, height, { fit: 'cover' })
    .jpeg({ quality, mozjpeg: true, progressive: false, chromaSubsampling: '4:4:4' })
    .toBuffer();
  // Write via temp then byte-compare is handled by caller; here just write buffer
  ensureDir(path.dirname(jpgPath));
  // Use byte-compare via helper if caller wants; for now just write
  // But to keep helper consistency, we return buffer
  return buffer;
}

export async function renderRasterToJpg({
  rasterPath,
  jpgPath,
  width = WIDTH,
  height = HEIGHT,
  quality = 88,
}) {
  const buffer = await sharp(rasterPath)
    .resize(width, height, {
      fit: 'contain',
      background: { r: 255, g: 255, b: 255, alpha: 1 },
      withoutEnlargement: false,
    })
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .jpeg({ quality, progressive: false, mozjpeg: true, chromaSubsampling: '4:4:4' })
    .toBuffer();
  ensureDir(path.dirname(jpgPath));
  return buffer;
}

// Internal helpers for pipeline
function jpgNameForSlug(slug) {
  return `${slug}.${jpgVersionToken()}.jpg`;
}

function jpgOwnerSlug(fileName) {
  const versioned = fileName.match(/^([a-z0-9_]+)\.([a-z0-9_-]+)\.jpg$/);
  if (versioned) {
    return versioned[1];
  }
  const legacy = fileName.match(/^([a-z0-9_]+)\.jpg$/);
  if (legacy) {
    return legacy[1];
  }
  return null;
}

function readJson(filePath) {
  return JSON.parse(stripBom(fs.readFileSync(filePath, 'utf8')));
}

function loadCategoriesFromRegistry(registryPath) {
  const payload = readJson(registryPath);
  const rawCategories = payload.categories || [];
  const records = [];
  for (const entry of rawCategories) {
    if (!entry || typeof entry !== 'object') continue;
    const rawSlug = String(entry.slug || entry.id || '').trim();
    if (!rawSlug) continue;
    let slug;
    try {
      slug = slugifyCategory(rawSlug);
    } catch {
      continue;
    }
    const titlePayload = entry.display_name || {};
    let title = '';
    if (titlePayload && typeof titlePayload === 'object') {
      title = String(titlePayload.default || '').trim();
    }
    title = title || slug;
    records.push({ slug, title });
  }
  return records;
}

function loadCategoriesFromLegacy(legacyPath) {
  const payload = readJson(legacyPath);
  const rawCategories = payload.categories || [];
  const records = [];
  for (const entry of rawCategories) {
    if (!entry || typeof entry !== 'object') continue;
    const rawSlug = String(entry.slug || entry.id || '').trim();
    if (!rawSlug) continue;
    let slug;
    try {
      slug = slugifyCategory(rawSlug);
    } catch {
      continue;
    }
    const title = String(entry.title || slug).trim() || slug;
    records.push({ slug, title });
  }
  return records;
}

export function loadCategoryRecords(repoRoot) {
  const registry = path.join(repoRoot, 'data', 'category_registry.json');
  const legacy = path.join(repoRoot, 'data', 'categories.json');
  let records;
  if (fs.existsSync(registry)) {
    records = loadCategoriesFromRegistry(registry);
  } else if (fs.existsSync(legacy)) {
    records = loadCategoriesFromLegacy(legacy);
  } else {
    throw new Error('No category source found in data/.');
  }
  const unique = new Map();
  const collisions = new Map();
  for (const record of records) {
    if (unique.has(record.slug)) {
      if (!collisions.has(record.slug)) {
        collisions.set(record.slug, [unique.get(record.slug).title]);
      }
      collisions.get(record.slug).push(record.title);
      continue;
    }
    unique.set(record.slug, record);
  }
  if (collisions.size > 0) {
    const examples = Array.from(collisions.entries())
      .map(([slug, titles]) => `${slug}: ${titles}`)
      .join(', ');
    throw new Error(
      `Slug collision detected in category source. Resolve before generating OG assets. Details: ${examples}`
    );
  }
  return Array.from(unique.values()).sort((a, b) => a.slug.localeCompare(b.slug));
}

function manifestPayload({ records, categoriesDir, iconMapVersion }) {
  const slugs = records.map((r) => r.slug).sort();
  const items = {};
  const versionToken = jpgVersionToken();
  for (const slug of slugs) {
    const svgFile = safeSlugPath(categoriesDir, slug, '.svg');
    const jpgFile = safeVersionedJpgPath(categoriesDir, slug, versionToken);
    const jpgFileName = path.basename(jpgFile);
    items[slug] = {
      svg: {
        exists: fs.existsSync(svgFile),
        size: fs.existsSync(svgFile) ? fs.statSync(svgFile).size : 0,
        sha256: fs.existsSync(svgFile) ? fileSha256(svgFile) : '',
        width: WIDTH,
        height: HEIGHT,
      },
      jpg: {
        file: jpgFileName,
        exists: fs.existsSync(jpgFile),
        size: fs.existsSync(jpgFile) ? fs.statSync(jpgFile).size : 0,
        sha256: fs.existsSync(jpgFile) ? fileSha256(jpgFile) : '',
        width: WIDTH,
        height: HEIGHT,
      },
    };
  }
  return {
    template_version: TEMPLATE_VERSION,
    jpg_version_token: versionToken,
    icon_map_version: iconMapVersion,
    managed_slug_pattern: '[a-z0-9_]+',
    slugs,
    items,
  };
}

function loadManifest(manifestFile) {
  if (!fs.existsSync(manifestFile)) return {};
  try {
    return readJson(manifestFile);
  } catch {
    return {};
  }
}

function writeManifestIfChanged(manifestFile, payload) {
  const sorted = `${JSON.stringify(sortObject(payload), null, 2)}\n`;
  return writeTextIfChanged(manifestFile, sorted);
}

function sortObject(obj) {
  if (Array.isArray(obj)) {
    return obj.map(sortObject);
  }
  if (obj && typeof obj === 'object') {
    const sorted = {};
    for (const key of Object.keys(obj).sort()) {
      sorted[key] = sortObject(obj[key]);
    }
    return sorted;
  }
  return obj;
}

function normalizeSlugOrRaise(slug) {
  let normalized;
  try {
    normalized = slugifyCategory(slug);
  } catch (e) {
    throw new Error(String(e.message || e), { cause: e });
  }
  if (!isSlugSafe(normalized)) {
    throw new Error(`Unsafe managed slug: ${slug}`);
  }
  return normalized;
}

function jpgVariantsForSlug(categoriesDir, slug) {
  if (!fs.existsSync(categoriesDir)) return [];
  const variants = [];
  const prefix = `${slug}.`;
  for (const entry of fs.readdirSync(categoriesDir, { withFileTypes: true })) {
    if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== '.jpg') continue;
    if (entry.name === `${slug}.jpg` || entry.name.startsWith(prefix)) {
      variants.push(path.join(categoriesDir, entry.name));
    }
  }
  return variants;
}

async function renderJpgIfChanged(repoRoot, svgFile, jpgFile) {
  // Render SVG to JPG buffer via sharp (in-process, no spawn)
  const svgBuffer = fs.readFileSync(svgFile);
  const rendered = await sharp(svgBuffer, { density: 300 })
    .resize(WIDTH, HEIGHT, { fit: 'cover' })
    .jpeg({ quality: 88, mozjpeg: true, progressive: false, chromaSubsampling: '4:4:4' })
    .toBuffer();
  return writeBufferIfChanged(jpgFile, rendered);
}

async function renderRasterJpgIfChanged(repoRoot, rasterFile, jpgFile) {
  const rendered = await sharp(rasterFile)
    .resize(WIDTH, HEIGHT, {
      fit: 'contain',
      background: { r: 255, g: 255, b: 255, alpha: 1 },
      withoutEnlargement: false,
    })
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .jpeg({ quality: 88, progressive: false, mozjpeg: true, chromaSubsampling: '4:4:4' })
    .toBuffer();
  return writeBufferIfChanged(jpgFile, rendered);
}

// ---------------------------------------------------------------------------
// Public pipeline API (mirrors pipeline.py)
// ---------------------------------------------------------------------------
export async function ensureCategoryAssets(
  slug,
  { title = null, repoRoot = null, dryRun = false, force = false } = {}
) {
  const base = repoRoot ? path.resolve(repoRoot) : REPO_ROOT;
  const managedSlug = normalizeSlugOrRaise(slug);
  const categoriesDir = categoryAssetsDir(base);
  const iconsDir = iconAssetsDir(base);
  const mapping = loadIconMapping(iconMapPath(base));
  const resolvedTitle = String(title || managedSlug).trim() || managedSlug;
  const iconName = resolveIconName(mapping, managedSlug, resolvedTitle);
  const iconInner = loadIconInnerSvg(iconName, iconsDir);
  const svgPayload = renderSvg({
    slug: managedSlug,
    title: resolvedTitle,
    iconInnerSvg: iconInner,
    iconName,
  });

  const svgFile = safeSlugPath(categoriesDir, managedSlug, '.svg');
  const jpgFile = safeVersionedJpgPath(categoriesDir, managedSlug, jpgVersionToken());
  const overrideRaster = findOverrideRasterPath(categoriesDir, managedSlug);
  let svgChanged;
  let jpgChanged;
  const removedJpgVariants = [];

  if (!dryRun) {
    svgChanged = writeTextIfChanged(svgFile, svgPayload);
    try {
      if (overrideRaster) {
        jpgChanged = await renderRasterJpgIfChanged(base, overrideRaster, jpgFile);
      } else if (force || svgChanged || !fs.existsSync(jpgFile)) {
        jpgChanged = await renderJpgIfChanged(base, svgFile, jpgFile);
      } else {
        jpgChanged = false;
      }
    } catch (e) {
      throw new Error(String(e.message || e), { cause: e });
    }
    for (const stale of jpgVariantsForSlug(categoriesDir, managedSlug)) {
      if (path.resolve(stale) === path.resolve(jpgFile)) continue;
      fs.unlinkSync(stale);
      removedJpgVariants.push(String(stale));
      jpgChanged = true;
    }
  } else {
    svgChanged =
      force || !fs.existsSync(svgFile) || fs.readFileSync(svgFile, 'utf8') !== svgPayload;
    jpgChanged = force || !fs.existsSync(jpgFile) || overrideRaster !== null;
    const stale = jpgVariantsForSlug(categoriesDir, managedSlug).filter(
      (p) => path.resolve(p) !== path.resolve(jpgFile)
    );
    removedJpgVariants.push(...stale.map(String));
    jpgChanged = jpgChanged || stale.length > 0;
  }

  return {
    slug: managedSlug,
    title: resolvedTitle,
    icon: iconName,
    svg: String(svgFile),
    jpg: String(jpgFile),
    jpg_file: path.basename(jpgFile),
    override_raster: overrideRaster ? String(overrideRaster) : null,
    removed_jpg_variants: removedJpgVariants,
    svg_changed: Boolean(svgChanged),
    jpg_changed: Boolean(jpgChanged),
  };
}

export async function deleteCategoryAssets(slug, { repoRoot = null, dryRun = false } = {}) {
  const base = repoRoot ? path.resolve(repoRoot) : REPO_ROOT;
  const managedSlug = normalizeSlugOrRaise(slug);
  const categoriesDir = categoryAssetsDir(base);
  const deleted = [];
  const svgTarget = safeSlugPath(categoriesDir, managedSlug, '.svg');
  if (fs.existsSync(svgTarget)) {
    if (!dryRun) fs.unlinkSync(svgTarget);
    deleted.push(String(svgTarget));
  }
  for (const variant of jpgVariantsForSlug(categoriesDir, managedSlug)) {
    if (!dryRun) fs.unlinkSync(variant);
    deleted.push(String(variant));
  }
  return { slug: managedSlug, deleted };
}

export async function syncCategoryAssets({ repoRoot = null, dryRun = false, force = false } = {}) {
  const base = repoRoot ? path.resolve(repoRoot) : REPO_ROOT;
  const categoriesDir = categoryAssetsDir(base);
  ensureDir(categoriesDir);

  const records = loadCategoryRecords(base);
  const mapping = loadIconMapping(iconMapPath(base));
  const manifestFile = manifestPath(base);
  const previousManifest = loadManifest(manifestFile);
  const forceByVersion =
    previousManifest.template_version !== TEMPLATE_VERSION ||
    previousManifest.icon_map_version !== mapping.version;

  const generated = [];
  let anyChanged = false;
  for (const record of records) {
    const result = await ensureCategoryAssets(record.slug, {
      title: record.title,
      repoRoot: base,
      dryRun,
      force: force || forceByVersion,
    });
    generated.push(result);
    anyChanged = anyChanged || Boolean(result.svg_changed) || Boolean(result.jpg_changed);
  }

  const expectedSlugs = new Set(records.map((r) => r.slug));
  const removed = [];
  if (fs.existsSync(categoriesDir)) {
    for (const entry of fs.readdirSync(categoriesDir, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const suffix = path.extname(entry.name).toLowerCase();
      if (suffix === '.svg') {
        const stem = path.basename(entry.name, '.svg').toLowerCase();
        if (!isSlugSafe(stem) || expectedSlugs.has(stem)) continue;
        if (!dryRun) fs.unlinkSync(path.join(categoriesDir, entry.name));
        removed.push(String(path.join(categoriesDir, entry.name)));
        anyChanged = true;
        continue;
      }
      if (suffix !== '.jpg') continue;
      const ownerSlug = jpgOwnerSlug(entry.name.toLowerCase());
      if (!ownerSlug || !isSlugSafe(ownerSlug)) continue;
      const isExpectedOwner = expectedSlugs.has(ownerSlug);
      const isExpectedName = entry.name.toLowerCase() === jpgNameForSlug(ownerSlug);
      if (isExpectedOwner && isExpectedName) continue;
      if (!dryRun) fs.unlinkSync(path.join(categoriesDir, entry.name));
      removed.push(String(path.join(categoriesDir, entry.name)));
      anyChanged = true;
    }
  }

  const manifestPayloadData = manifestPayload({
    records,
    categoriesDir,
    iconMapVersion: mapping.version,
  });
  let manifestChanged = false;
  if (!dryRun) {
    manifestChanged = writeManifestIfChanged(manifestFile, manifestPayloadData);
    anyChanged = anyChanged || manifestChanged;
  }

  return {
    generated,
    removed,
    manifest: String(manifestFile),
    manifest_changed: manifestChanged,
    template_version: TEMPLATE_VERSION,
    icon_map_version: mapping.version,
    changed: anyChanged,
    total_categories: records.length,
  };
}

export function lookupTitleForSlug(slug, { repoRoot = null } = {}) {
  const base = repoRoot ? path.resolve(repoRoot) : REPO_ROOT;
  const managed = normalizeSlugOrRaise(slug);
  for (const record of loadCategoryRecords(base)) {
    if (record.slug === managed) return record.title;
  }
  return null;
}
