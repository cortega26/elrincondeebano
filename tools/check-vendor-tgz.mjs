import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = process.cwd();
const VENDOR_REL = 'astro-poc/vendor/anymatch';
const TGZ_NAME = 'anymatch-3.1.3.tgz';
const PKG_DIR = 'package';
const VENDOR_DIR = path.join(ROOT, VENDOR_REL);
const TGZ_PATH = path.join(VENDOR_DIR, TGZ_NAME);

export function sha256(filePath) {
  const data = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(data).digest('hex');
}

export function collectFiles(dir) {
  const result = new Map();
  function walk(current) {
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        const rel = path.relative(dir, full);
        result.set(rel, sha256(full));
      }
    }
  }
  if (fs.existsSync(dir)) {
    walk(dir);
  }
  return result;
}

export function compareFileSets(mapA, mapB) {
  const mismatched = [];
  const missingInB = [];
  const extraInB = [];

  for (const [rel, hashA] of mapA) {
    if (!mapB.has(rel)) {
      missingInB.push(rel);
    } else if (mapB.get(rel) !== hashA) {
      mismatched.push(rel);
    }
  }
  for (const rel of mapB.keys()) {
    if (!mapA.has(rel)) {
      extraInB.push(rel);
    }
  }
  return { mismatched, missingInB, extraInB };
}

function extractTarball(tgzPath, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  execSync(`tar -xzf ${JSON.stringify(tgzPath)} -C ${JSON.stringify(destDir)}`, {
    stdio: 'pipe',
  });
}

function runNpmPack(vendorDir, packDestDir) {
  fs.mkdirSync(packDestDir, { recursive: true });
  execSync(`npm pack --pack-destination ${JSON.stringify(packDestDir)}`, {
    cwd: vendorDir,
    stdio: 'pipe',
  });
  const files = fs.readdirSync(packDestDir).filter((f) => f.endsWith('.tgz'));
  if (files.length === 0) {
    throw new Error(`npm pack produced no tgz in ${packDestDir}`);
  }
  // Prefer the canonical name if multiple; take the first sorted.
  files.sort();
  const chosen = files.includes(TGZ_NAME) ? TGZ_NAME : files[0];
  return path.join(packDestDir, chosen);
}

export function checkVendorTgz(options = {}) {
  const vendorDir = options.vendorDir ?? VENDOR_DIR;
  const tgzPath = options.tgzPath ?? TGZ_PATH;

  if (!fs.existsSync(vendorDir)) {
    return { ok: false, error: `Vendor dir not found: ${vendorDir}` };
  }
  if (!fs.existsSync(tgzPath)) {
    return { ok: false, error: `Vendor tgz not found: ${tgzPath}` };
  }

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vendor-tgz-'));
  const committedExtract = path.join(tmpRoot, 'committed');
  const packDest = path.join(tmpRoot, 'pack');
  const freshExtract = path.join(tmpRoot, 'fresh');

  try {
    extractTarball(tgzPath, committedExtract);
    const freshTgz = runNpmPack(vendorDir, packDest);
    extractTarball(freshTgz, freshExtract);

    const committedPkgDir = path.join(committedExtract, PKG_DIR);
    const freshPkgDir = path.join(freshExtract, PKG_DIR);

    if (!fs.existsSync(committedPkgDir)) {
      return {
        ok: false,
        error: `Committed tgz did not contain a package/ dir (contents: ${fs.readdirSync(committedExtract).join(', ')})`,
      };
    }
    if (!fs.existsSync(freshPkgDir)) {
      return {
        ok: false,
        error: `Fresh pack did not contain a package/ dir (contents: ${fs.readdirSync(freshExtract).join(', ')})`,
      };
    }

    const committedFiles = collectFiles(committedPkgDir);
    const freshFiles = collectFiles(freshPkgDir);

    const { mismatched, missingInB, extraInB } = compareFileSets(committedFiles, freshFiles);

    // missingInB = in committed but not in fresh (removed from source)
    // extraInB = in fresh but not in committed (new files, e.g. LICENSE/README after repack)
    // For reporting we want committed vs fresh diff.
    // To satisfy the STOP condition we compare extracted file CONTENTS (hashes),
    // not raw tgz bytes, so gzip timestamp/mtime non-determinism is irrelevant.
    if (mismatched.length === 0 && missingInB.length === 0 && extraInB.length === 0) {
      return { ok: true, committedFiles, freshFiles };
    }

    const details = [];
    if (mismatched.length > 0) {
      details.push(`Content mismatch (${mismatched.length}): ${mismatched.join(', ')}`);
      for (const rel of mismatched) {
        details.push(
          `  ${rel}: committed ${committedFiles.get(rel)?.slice(0, 12)} vs fresh ${freshFiles.get(rel)?.slice(0, 12)}`
        );
      }
    }
    if (missingInB.length > 0) {
      details.push(
        `In committed tgz but not in fresh pack (${missingInB.length}): ${missingInB.join(', ')}`
      );
    }
    if (extraInB.length > 0) {
      details.push(
        `In fresh pack but not in committed tgz (${extraInB.length}): ${extraInB.join(', ')}`
      );
    }

    return {
      ok: false,
      error: details.join('\n'),
      mismatched,
      missingInB,
      extraInB,
      committedFiles,
      freshFiles,
    };
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}

function main() {
  const result = checkVendorTgz();
  if (result.ok) {
    console.log(
      `Vendor tgz check passed — ${result.committedFiles.size} files in sync (${VENDOR_REL} ↔ ${TGZ_NAME})`
    );
    process.exit(0);
  } else {
    console.error('Vendor tgz check FAILED');
    console.error(result.error);
    console.error('');
    console.error(
      `Vendored anymatch dir and tgz are out of sync — run \`npm pack\` from ${VENDOR_REL}/ and commit the new tgz in the same commit.`
    );
    console.error(
      'Note: comparison is on extracted file contents (sha256), not raw tgz bytes, so gzip timestamp non-determinism is ignored (see plan 160 STOP condition).'
    );
    process.exit(1);
  }
}

const __filename = fileURLToPath(import.meta.url);
if (path.resolve(process.argv[1] ?? '') === path.resolve(__filename)) {
  main();
}
