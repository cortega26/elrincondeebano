import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OVERRIDE_SUFFIXES = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const OVERRIDE_ALIAS_MAP = new Map([['chocolate', 'chocolates']]);

function repoRootFromHere() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
}

export function normalizeLookupToken(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function readCategoryRegistry(repoRoot) {
  const registryPath = path.join(repoRoot, 'data', 'category_registry.json');
  return JSON.parse(fs.readFileSync(registryPath, 'utf8'));
}

function buildCategoryLookup(categories) {
  const lookup = new Map();

  for (const category of categories) {
    const slug = String(category?.slug || '').trim();
    if (!slug) {
      continue;
    }
    const candidates = [
      slug,
      category?.id,
      category?.key,
      category?.display_name?.default,
    ];

    for (const candidate of candidates) {
      const token = normalizeLookupToken(candidate);
      if (!token || lookup.has(token)) {
        continue;
      }
      lookup.set(token, slug);
    }
  }

  return lookup;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function removeStaleOverrideVariants(targetDir, slug, keepFileName) {
  const removed = [];
  for (const entry of fs.readdirSync(targetDir, { withFileTypes: true })) {
    if (!entry.isFile()) {
      continue;
    }
    const ext = path.extname(entry.name).toLowerCase();
    if (!OVERRIDE_SUFFIXES.has(ext)) {
      continue;
    }
    if (!entry.name.startsWith(`${slug}.override`)) {
      continue;
    }
    if (entry.name === keepFileName) {
      continue;
    }
    fs.unlinkSync(path.join(targetDir, entry.name));
    removed.push(entry.name);
  }
  return removed;
}

function copyIfChanged(sourcePath, targetPath) {
  const sourceBytes = fs.readFileSync(sourcePath);
  if (fs.existsSync(targetPath)) {
    const targetBytes = fs.readFileSync(targetPath);
    if (Buffer.compare(sourceBytes, targetBytes) === 0) {
      return false;
    }
  }
  fs.writeFileSync(targetPath, sourceBytes);
  return true;
}

export function runSyncCategoryOgOverrides({ repoRoot = repoRootFromHere() } = {}) {
  const sourceDir = path.join(repoRoot, 'imagenes');
  const targetDir = path.join(repoRoot, 'assets', 'images', 'og', 'categories');
  const registry = readCategoryRegistry(repoRoot);
  const categories = Array.isArray(registry?.categories) ? registry.categories : [];
  const activeCategories = categories.filter((category) => category?.active);
  const categoryLookup = buildCategoryLookup(categories);

  ensureDir(targetDir);

  const matchedSources = [];
  const unmatchedSources = [];
  const synced = [];

  if (!fs.existsSync(sourceDir)) {
    return {
      sourceDir,
      targetDir,
      synced,
      unmatchedSources,
      missingActiveCategories: activeCategories.map((category) => category.slug),
    };
  }

  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    if (!entry.isFile()) {
      continue;
    }
    const ext = path.extname(entry.name).toLowerCase();
    if (!OVERRIDE_SUFFIXES.has(ext)) {
      continue;
    }

    const baseName = path.basename(entry.name, ext);
    const normalized = normalizeLookupToken(baseName);
    const aliasSlug = OVERRIDE_ALIAS_MAP.get(normalized);
    const slug = aliasSlug || categoryLookup.get(normalized);

    if (!slug) {
      unmatchedSources.push(entry.name);
      continue;
    }

    matchedSources.push(slug);

    const sourcePath = path.join(sourceDir, entry.name);
    const targetFileName = `${slug}.override${ext}`;
    const targetPath = path.join(targetDir, targetFileName);
    const changed = copyIfChanged(sourcePath, targetPath);
    const removedVariants = removeStaleOverrideVariants(targetDir, slug, targetFileName);

    synced.push({
      slug,
      source: entry.name,
      target: path.relative(repoRoot, targetPath),
      changed,
      removedVariants,
    });
  }

  const missingActiveCategories = activeCategories
    .map((category) => String(category.slug))
    .filter((slug) => !matchedSources.includes(slug))
    .sort();

  return {
    sourceDir,
    targetDir,
    synced,
    unmatchedSources,
    missingActiveCategories,
  };
}

function runCli() {
  const result = runSyncCategoryOgOverrides();
  console.log(JSON.stringify(result, null, 2));
}

const isDirectRun = process.argv[1] === fileURLToPath(import.meta.url);
if (isDirectRun) {
  runCli();
}
