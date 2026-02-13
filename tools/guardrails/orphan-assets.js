'use strict';

const fs = require('node:fs');
const path = require('node:path');

const IMAGE_EXTENSIONS = new Set(['.avif', '.webp', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico']);
const SCANNED_TEXT_EXTENSIONS = new Set([
  '.js',
  '.mjs',
  '.cjs',
  '.ts',
  '.mts',
  '.json',
  '.ejs',
  '.html',
  '.css',
  '.md',
  '.yml',
  '.yaml',
  '.txt',
]);

const DEFAULT_SCAN_TARGETS = [
  'templates',
  'src',
  'tools',
  'data',
  'index.html',
  '404.html',
  'preview.html',
  'app.webmanifest',
];

const DEFAULT_ALLOWLIST = {
  ignoredDirectories: ['originals', 'variants'],
  allowedOrphans: [],
};

const ASSET_REFERENCE_REGEX =
  /\/?assets\/images\/[^"'`<>]*?\.(?:avif|webp|png|jpe?g|gif|svg|ico)/gi;

function normalizePath(value) {
  if (!value) return null;
  const withoutQuery = String(value).split(/[?#]/, 1)[0];
  const normalized = withoutQuery
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/^\/+/, '')
    .trim();
  return normalized || null;
}

function isImageFile(filePath) {
  return IMAGE_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function isScannableTextFile(filePath) {
  return SCANNED_TEXT_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function listFilesRecursive(rootDir) {
  if (!fs.existsSync(rootDir)) {
    return [];
  }

  const result = [];
  const stack = [rootDir];

  while (stack.length) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile()) {
        result.push(fullPath);
      }
    }
  }

  return result;
}

function addReferencesFromText(content, references) {
  ASSET_REFERENCE_REGEX.lastIndex = 0;
  let match = ASSET_REFERENCE_REGEX.exec(content);
  while (match) {
    const normalized = normalizePath(match[0]);
    if (normalized) {
      references.add(normalized);
    }
    match = ASSET_REFERENCE_REGEX.exec(content);
  }
}

function readJson(filePath, fallbackValue) {
  if (!fs.existsSync(filePath)) return fallbackValue;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallbackValue;
  }
}

function collectCatalogReferences(repoRoot, references) {
  const catalogPath = path.join(repoRoot, 'data', 'product_data.json');
  const parsed = readJson(catalogPath, null);
  const products = Array.isArray(parsed?.products) ? parsed.products : [];

  for (const product of products) {
    for (const key of ['image_path', 'image_avif_path']) {
      const normalized = normalizePath(product?.[key]);
      if (normalized && normalized.startsWith('assets/images/')) {
        references.add(normalized);
      }
    }
  }
}

function collectTextReferences(repoRoot, references, scanTargets = DEFAULT_SCAN_TARGETS) {
  for (const target of scanTargets) {
    const targetPath = path.join(repoRoot, target);
    if (!fs.existsSync(targetPath)) {
      continue;
    }

    const stat = fs.statSync(targetPath);
    if (stat.isFile()) {
      const relativePath = normalizePath(path.relative(repoRoot, targetPath));
      if (relativePath === 'tools/guardrails/orphan-assets.allowlist.json') continue;
      if (!isScannableTextFile(targetPath)) continue;
      const content = fs.readFileSync(targetPath, 'utf8');
      addReferencesFromText(content, references);
      continue;
    }

    const files = listFilesRecursive(targetPath);
    for (const filePath of files) {
      const relativePath = normalizePath(path.relative(repoRoot, filePath));
      if (relativePath === 'tools/guardrails/orphan-assets.allowlist.json') continue;
      if (relativePath && relativePath.startsWith('reports/')) continue;
      if (!isScannableTextFile(filePath)) continue;
      const content = fs.readFileSync(filePath, 'utf8');
      addReferencesFromText(content, references);
    }
  }
}

function loadAllowlist(allowlistPath) {
  const allowlist = readJson(allowlistPath, DEFAULT_ALLOWLIST);
  const ignoredDirectories = Array.isArray(allowlist?.ignoredDirectories)
    ? allowlist.ignoredDirectories
    : DEFAULT_ALLOWLIST.ignoredDirectories;
  const allowedOrphans = new Set(
    (Array.isArray(allowlist?.allowedOrphans) ? allowlist.allowedOrphans : [])
      .map((entry) => normalizePath(entry))
      .filter(Boolean)
  );
  return { ignoredDirectories, allowedOrphans };
}

function collectCandidateAssets(repoRoot, ignoredDirectories) {
  const imagesRoot = path.join(repoRoot, 'assets', 'images');
  const files = listFilesRecursive(imagesRoot);

  return files
    .filter(isImageFile)
    .map((filePath) => normalizePath(path.relative(repoRoot, filePath)))
    .filter(Boolean)
    .filter((relativePath) => {
      const fromImagesRoot = relativePath.replace(/^assets\/images\//, '');
      return !ignoredDirectories.some((dir) => {
        const prefix = normalizePath(dir);
        return prefix && (fromImagesRoot === prefix || fromImagesRoot.startsWith(`${prefix}/`));
      });
    });
}

function findOrphanAssets({
  repoRoot = path.resolve(__dirname, '..', '..'),
  allowlistPath = path.join(__dirname, 'orphan-assets.allowlist.json'),
  scanTargets = DEFAULT_SCAN_TARGETS,
} = {}) {
  const { ignoredDirectories, allowedOrphans } = loadAllowlist(allowlistPath);
  const references = new Set();

  collectCatalogReferences(repoRoot, references);
  collectTextReferences(repoRoot, references, scanTargets);

  const candidates = collectCandidateAssets(repoRoot, ignoredDirectories);
  const orphanAssets = candidates.filter((candidate) => !references.has(candidate)).sort();
  const unexpectedOrphans = orphanAssets.filter((candidate) => !allowedOrphans.has(candidate)).sort();
  const staleAllowedOrphans = Array.from(allowedOrphans)
    .filter((candidate) => !orphanAssets.includes(candidate))
    .sort();

  return {
    orphanAssets,
    unexpectedOrphans,
    staleAllowedOrphans,
    ignoredDirectories: [...ignoredDirectories].sort(),
    referencedAssetsCount: references.size,
    candidateAssetsCount: candidates.length,
  };
}

function parseArgs(argv) {
  const args = {
    reportPath: null,
    writeAllowlist: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--report') {
      args.reportPath = argv[index + 1] || null;
      index += 1;
    } else if (arg === '--write-allowlist') {
      args.writeAllowlist = true;
    }
  }

  return args;
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

function main() {
  const repoRoot = path.resolve(__dirname, '..', '..');
  const allowlistPath = path.join(__dirname, 'orphan-assets.allowlist.json');
  const args = parseArgs(process.argv.slice(2));

  const result = findOrphanAssets({ repoRoot, allowlistPath });

  if (args.writeAllowlist) {
    writeJson(allowlistPath, {
      ignoredDirectories: result.ignoredDirectories,
      allowedOrphans: result.orphanAssets,
    });
    console.log(`Updated ${path.relative(repoRoot, allowlistPath)} with current orphan baseline.`);
    return;
  }

  if (args.reportPath) {
    const reportPath = path.resolve(repoRoot, args.reportPath);
    writeJson(reportPath, {
      generatedAt: new Date().toISOString(),
      ...result,
    });
    console.log(`Wrote orphan-asset report: ${path.relative(repoRoot, reportPath)}`);
  }

  if (result.unexpectedOrphans.length) {
    console.error('Orphan asset guard failed. Unexpected orphan image assets detected:');
    for (const orphan of result.unexpectedOrphans) {
      console.error(`- ${orphan}`);
    }
    process.exitCode = 1;
    return;
  }

  if (result.staleAllowedOrphans.length) {
    console.warn('Orphan asset allowlist contains stale entries (can be removed):');
    for (const staleEntry of result.staleAllowedOrphans) {
      console.warn(`- ${staleEntry}`);
    }
  }

  console.log(
    `Orphan asset guard passed (${result.orphanAssets.length} orphan assets, ${result.referencedAssetsCount} references scanned).`
  );
}

if (require.main === module) {
  main();
}

module.exports = {
  findOrphanAssets,
  normalizePath,
};
