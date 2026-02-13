import { execSync } from 'node:child_process';
import fs from 'node:fs';

export function sh(cmd) {
  try {
    const stdout = execSync(cmd, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return stdout.trim();
  } catch (error) {
    const stderr = error?.stderr?.toString()?.trim();
    const stdout = error?.stdout?.toString()?.trim();
    const details = [stderr, stdout].filter(Boolean).join('\n');
    const message = `Command failed: ${cmd}${details ? `\n${details}` : ''}`;
    throw new Error(message, { cause: error });
  }
}

export function readFile(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

export function getBaseRef() {
  try {
    sh('git rev-parse --verify origin/main');
    return 'origin/main';
  } catch {
    return 'HEAD~1';
  }
}

export function getDiffRange() {
  const base = getBaseRef();
  return `${base}...HEAD`;
}

export function changedFiles(baseRef, headRef = 'HEAD') {
  const range = baseRef && headRef ? `${baseRef}...${headRef}` : getDiffRange();
  try {
    const out = sh(`git diff --name-only ${range}`);
    return out ? out.split(/\r?\n/).filter(Boolean) : [];
  } catch (error) {
    if (baseRef) {
      const fallback = getDiffRange();
      const out = sh(`git diff --name-only ${fallback}`);
      return out ? out.split(/\r?\n/).filter(Boolean) : [];
    }
    throw error;
  }
}

export function readFileFromGit(ref, filePath) {
  return sh(`git show ${ref}:${filePath}`);
}

export function fail(message) {
  console.error(message);
  process.exit(1);
}

export function ok(message) {
  if (message) {
    console.log(message);
  }
  process.exit(0);
}

export function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function extractBlock(content, key, type = 'object') {
  const open = type === 'array' ? '\\[' : '\\{';
  const close = type === 'array' ? '\\]' : '\\}';
  const re = new RegExp(`${escapeRegExp(key)}\\s*:\\s*${open}([\\s\\S]*?)${close}`, 'm');
  const match = content.match(re);
  return match ? match[1] : null;
}

export function extractObjectPairs(block) {
  const pairs = {};
  if (!block) return pairs;
  const re = /([A-Za-z0-9_]+)\s*:\s*['"`]([^'"`]+)['"`]/g;
  let match;
  while ((match = re.exec(block)) !== null) {
    pairs[match[1]] = match[2];
  }
  return pairs;
}

export function findSelectorBlock(css, selector) {
  const re = new RegExp(`${escapeRegExp(selector)}\\s*\\{([\\s\\S]*?)\\}`, 'm');
  const match = css.match(re);
  return match ? match[1] : null;
}

export function extractDeclaration(block, property) {
  if (!block) return null;
  const re = new RegExp(`${escapeRegExp(property)}\\s*:\\s*([^;]+);`);
  const match = block.match(re);
  return match ? match[1].trim() : null;
}
