import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const BINARY_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.avif',
  '.ico',
  '.pdf',
  '.zip',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
  '.mp4',
  '.webm',
  '.mp3',
  '.ogg',
  '.bin',
  '.pyc',
]);

const SECRET_PATTERNS = [
  { id: 'private-key', regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
  { id: 'github-token', regex: /\bgh[pousr]_[A-Za-z0-9]{36,255}\b/g },
  { id: 'npm-token', regex: /\bnpm_[A-Za-z0-9]{36}\b/g },
  { id: 'aws-access-key', regex: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  { id: 'google-api-key', regex: /\bAIza[0-9A-Za-z\-_]{35}\b/g },
  { id: 'stripe-secret', regex: /\bsk_(?:live|test)_[0-9A-Za-z]{16,}\b/g },
  { id: 'slack-token', regex: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
  {
    id: 'generic-secret-assignment',
    regex:
      /\b(?:api[_-]?key|access[_-]?token|auth[_-]?token|secret|password)\b\s*[:=]\s*['"][A-Za-z0-9._/+=-]{20,}['"]/gi,
  },
  { id: 'jwt-token', regex: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g },
  { id: 'bearer-token-literal', regex: /\bBearer\s+[A-Za-z0-9._-]{24,}\b/g },
];

function listTrackedFiles() {
  const result = spawnSync('git', ['ls-files', '-z'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0) {
    const error = result.stderr?.trim() || 'git ls-files failed';
    throw new Error(error);
  }
  return result.stdout.split('\0').filter(Boolean);
}

function isBinaryPath(filePath) {
  return BINARY_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function isProbablyText(buffer) {
  return !buffer.includes(0);
}

function toLineNumber(source, offset) {
  let line = 1;
  for (let index = 0; index < offset; index += 1) {
    if (source.charCodeAt(index) === 10) {
      line += 1;
    }
  }
  return line;
}

function scanFile(filePath) {
  if (isBinaryPath(filePath)) {
    return [];
  }

  let buffer;
  try {
    buffer = fs.readFileSync(filePath);
  } catch {
    return [];
  }

  if (!isProbablyText(buffer)) {
    return [];
  }

  const content = buffer.toString('utf8');
  const findings = [];
  for (const pattern of SECRET_PATTERNS) {
    pattern.regex.lastIndex = 0;
    let match = pattern.regex.exec(content);
    while (match) {
      findings.push({
        filePath,
        line: toLineNumber(content, match.index),
        pattern: pattern.id,
      });
      match = pattern.regex.exec(content);
    }
  }
  return findings;
}

function main() {
  const files = listTrackedFiles();
  const findings = [];
  for (const filePath of files) {
    findings.push(...scanFile(filePath));
  }

  if (!findings.length) {
    console.log('Secret scan passed: no high-confidence credentials found.');
    return;
  }

  console.error('Secret scan failed: high-confidence credential patterns found.');
  for (const finding of findings) {
    console.error(`- ${finding.filePath}:${finding.line} [${finding.pattern}]`);
  }
  process.exitCode = 1;
}

main();
