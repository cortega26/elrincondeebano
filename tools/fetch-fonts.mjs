import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetch } from 'undici';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const outDir = path.join(rootDir, 'assets', 'fonts');
const defaultCssPath = path.join(outDir, 'fonts.css');

const GOOGLE_CSS =
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;700&family=Playfair+Display:wght@400;700&display=swap';
const DEFAULT_REMOTE_HOSTS = new Set(['fonts.googleapis.com', 'fonts.gstatic.com']);

function shouldAllowRemoteFetch() {
  const raw = process.env.ALLOW_REMOTE_FONTS;
  if (!raw) return false;
  const normalized = String(raw).trim().toLowerCase();
  return ['1', 'true', 'yes'].includes(normalized);
}

function getAllowedRemoteHosts() {
  const hosts = new Set(DEFAULT_REMOTE_HOSTS);
  const raw = process.env.FONTS_REMOTE_HOSTS;
  if (!raw) return hosts;
  for (const part of raw.split(/[\s,]+/)) {
    const host = part.trim().toLowerCase();
    if (host) hosts.add(host);
  }
  return hosts;
}

function assertAllowedRemoteUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch (err) {
    throw new Error(`Invalid remote URL "${rawUrl}"`);
  }
  if (parsed.protocol !== 'https:') {
    throw new Error(`Remote URL must use https: "${rawUrl}"`);
  }
  const allowed = getAllowedRemoteHosts();
  const host = parsed.hostname.toLowerCase();
  if (!allowed.has(host)) {
    throw new Error(
      `Remote host "${host}" not in allowlist. Set FONTS_REMOTE_HOSTS to allow it.`
    );
  }
  return parsed.toString();
}

function normalizeRemoteUrl(rawUrl) {
  if (rawUrl.startsWith('//')) {
    return `https:${rawUrl}`;
  }
  return rawUrl;
}

function isRemoteUrl(rawUrl) {
  return /^https?:/i.test(rawUrl) || rawUrl.startsWith('//');
}

async function loadFontsCss() {
  const cssPath = process.env.FONTS_CSS_PATH;
  if (cssPath && cssPath.trim()) {
    const resolved = path.resolve(rootDir, cssPath.trim());
    const css = await fs.promises.readFile(resolved, 'utf8');
    return { css, cssPath: resolved, source: 'FONTS_CSS_PATH' };
  }

  if (fs.existsSync(defaultCssPath)) {
    const css = await fs.promises.readFile(defaultCssPath, 'utf8');
    return { css, cssPath: defaultCssPath, source: 'default' };
  }

  if (!shouldAllowRemoteFetch()) {
    throw new Error(
      'Remote font fetch disabled. Add assets/fonts/fonts.css, set FONTS_CSS_PATH, or set ALLOW_REMOTE_FONTS=1.'
    );
  }

  const url = process.env.FONTS_CSS_URL || GOOGLE_CSS;
  const safeUrl = assertAllowedRemoteUrl(url);
  const res = await fetch(safeUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`Failed to fetch Google Fonts CSS: ${res.status}`);
  const css = await res.text();
  return { css, cssPath: null, source: safeUrl };
}

function escapeRegExp(value) {
  return value.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
}

function parseFontFaceBlocks(css) {
  return css.match(/@font-face\s*{[^}]*}/gi) ?? [];
}

function findFontFaceBlock(blocks, family, weight) {
  const famEsc = escapeRegExp(family);
  const famRe = new RegExp(`font-family:\\s*['"]${famEsc}['"]`, 'i');
  const weightRe = new RegExp(`font-weight:\\s*${weight}\\b`, 'i');
  let fallback = null;

  for (const block of blocks) {
    if (!famRe.test(block) || !weightRe.test(block)) {
      continue;
    }
    if (block.includes('U+0000-00FF')) {
      return block;
    }
    fallback = block;
  }

  return fallback;
}

function extractWoff2Url(block) {
  const urlMatch = block.match(/url\(([^)]+\.woff2)\)/i);
  if (!urlMatch) return null;
  return urlMatch[1];
}

function normalizeFontUrl(raw) {
  return raw.replace(/\u0026/g, '&').replace(/^['"]|['"]$/g, '').trim();
}

function resolveLocalFontPath(rawUrl, cssPath) {
  if (!cssPath) {
    throw new Error(`Local font URL "${rawUrl}" requires a local CSS file path.`);
  }
  const normalized = rawUrl.replace(/^\/+/, '');
  if (rawUrl.startsWith('/')) {
    return path.join(rootDir, normalized);
  }
  return path.resolve(path.dirname(cssPath), normalized);
}

async function downloadRemote(rawUrl, dest) {
  const normalized = normalizeRemoteUrl(rawUrl);
  let parsed;
  try {
    parsed = new URL(normalized);
  } catch (err) {
    throw new Error(`Invalid remote URL "${rawUrl}"`);
  }
  if (parsed.protocol !== 'https:') {
    throw new Error(`Remote URL must use https: "${rawUrl}"`);
  }
  const allowed = getAllowedRemoteHosts();
  const host = parsed.hostname.toLowerCase();
  if (!allowed.has(host)) {
    throw new Error(`Remote host "${host}" not in allowlist.`);
  }
  if (!/\.woff2(?:[?#].*)?$/i.test(parsed.pathname)) {
    throw new Error(`Remote font URL must be .woff2: "${rawUrl}"`);
  }
  const safeUrl = parsed.toString();
  const res = await fetch(safeUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${safeUrl}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.promises.writeFile(dest, buf);
}

async function copyLocal(source, dest) {
  const resolvedSource = path.resolve(source);
  const resolvedDest = path.resolve(dest);
  if (resolvedSource === resolvedDest) {
    return;
  }
  await fs.promises.copyFile(resolvedSource, resolvedDest);
}

async function fetchFontAsset(rawUrl, cssPath, dest) {
  const url = normalizeFontUrl(rawUrl);
  if (isRemoteUrl(url)) {
    if (!shouldAllowRemoteFetch()) {
      throw new Error(
        'Remote font download disabled. Set ALLOW_REMOTE_FONTS=1 to download remote assets.'
      );
    }
    const safeUrl = assertAllowedRemoteUrl(normalizeRemoteUrl(url));
    return downloadRemote(safeUrl, dest);
  }

  if (/^data:/i.test(url)) {
    throw new Error('Inline data URLs are not supported for font downloads.');
  }

  const sourcePath = resolveLocalFontPath(url, cssPath);
  await copyLocal(sourcePath, dest);
}

async function main() {
  await fs.promises.mkdir(outDir, { recursive: true });
  const { css, cssPath, source } = await loadFontsCss();
  const label = cssPath ? path.relative(rootDir, cssPath) : source;
  console.log(`Using font CSS from ${label}`);

  // Very small parser: find one woff2 URL per family/weight (latin subset preferred)
  const targets = [
    { family: 'Inter', weight: '400', file: 'inter-400.woff2' },
    { family: 'Inter', weight: '700', file: 'inter-700.woff2' },
    { family: 'Playfair Display', weight: '400', file: 'playfair-400.woff2' },
    { family: 'Playfair Display', weight: '700', file: 'playfair-700.woff2' },
  ];

  const blocks = parseFontFaceBlocks(css);
  for (const t of targets) {
    const block = findFontFaceBlock(blocks, t.family, t.weight);
    if (!block) {
      console.warn(`No @font-face block for ${t.family} ${t.weight}`);
      continue;
    }
    const url = extractWoff2Url(block);
    if (!url) {
      console.warn(`No woff2 URL inside block for ${t.family} ${t.weight}`);
      continue;
    }
    const dest = path.join(outDir, t.file);
    console.log(`Downloading ${t.family} ${t.weight} -> ${t.file}`);
    await fetchFontAsset(url, cssPath, dest);
  }
  console.log('Fonts downloaded to assets/fonts');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
