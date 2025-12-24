import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SCAN_DIRS = ['tools', 'scripts', 'admin', 'server', 'src', 'templates', 'data'];
const SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  'build',
  'dist',
  'coverage',
  'reports',
  '.stryker-tmp',
  '.venv',
  '.pytest_cache',
  '.qodo',
  'logs',
]);

const SKIP_FILES = new Set([path.normalize('tools/check-determinism-paths.mjs')]);

const ALLOWLIST = new Set();

const EXTENSIONS = new Set([
  '.js',
  '.mjs',
  '.cjs',
  '.ts',
  '.mts',
  '.cts',
  '.py',
  '.json',
  '.yml',
  '.yaml',
  '.sh',
]);

const PATTERNS = [
  { label: 'OneDrive', re: /OneDrive/i },
  { label: 'C:/Users', re: /C:\/Users/i },
  { label: 'C:\\Users', re: /C:\\Users/i },
  { label: 'USERPROFILE', re: /\bUSERPROFILE\b/ },
  { label: 'HOME', re: /\bHOME\b/ },
  { label: 'tilde-path', re: /~[\\/]/ },
];

function isAllowed(relPath) {
  return ALLOWLIST.has(relPath);
}

function shouldSkipDir(entry) {
  return SKIP_DIRS.has(entry.name);
}

function shouldScanFile(filePath) {
  const relPath = path.relative(ROOT, filePath);
  if (SKIP_FILES.has(path.normalize(relPath))) {
    return false;
  }
  return EXTENSIONS.has(path.extname(filePath));
}

function listFiles(rootDir) {
  const results = [];
  const stack = [rootDir];
  while (stack.length) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (shouldSkipDir(entry)) {
          continue;
        }
        stack.push(path.join(current, entry.name));
        continue;
      }
      const fullPath = path.join(current, entry.name);
      if (shouldScanFile(fullPath)) {
        results.push(fullPath);
      }
    }
  }
  return results;
}

function scanFile(fullPath) {
  const relPath = path.relative(ROOT, fullPath);
  const text = fs.readFileSync(fullPath, 'utf8');
  const lines = text.split(/\r?\n/);
  const hits = [];
  lines.forEach((line, index) => {
    for (const pattern of PATTERNS) {
      if (pattern.re.test(line)) {
        hits.push({
          line: index + 1,
          label: pattern.label,
          snippet: line.trim().slice(0, 200),
        });
      }
    }
  });
  return { relPath, hits };
}

function main() {
  const violations = [];
  const allowlisted = [];

  SCAN_DIRS.forEach((dir) => {
    const fullDir = path.join(ROOT, dir);
    if (!fs.existsSync(fullDir)) return;
    const files = listFiles(fullDir);
    files.forEach((file) => {
      const result = scanFile(file);
      if (result.hits.length === 0) return;
      if (isAllowed(result.relPath)) {
        allowlisted.push(result);
      } else {
        violations.push(result);
      }
    });
  });

  allowlisted.forEach((entry) => {
    entry.hits.forEach((hit) => {
      console.warn(
        `ALLOWLISTED: ${entry.relPath}:${hit.line} [${hit.label}] ${hit.snippet}`
      );
    });
  });

  if (violations.length > 0) {
    violations.forEach((entry) => {
      entry.hits.forEach((hit) => {
        console.error(`${entry.relPath}:${hit.line} [${hit.label}] ${hit.snippet}`);
      });
    });
    console.error('Determinism path scan failed. Remove local paths or update the allowlist.');
    process.exit(1);
  }

  console.log('Determinism path scan passed.');
}

main();
