'use strict';

const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..', '..');
const distRoot = path.join(repoRoot, 'astro-poc', 'dist');

function resolveRepoPath(...segments) {
  return path.join(repoRoot, ...segments);
}

function resolveDistPath(...segments) {
  return path.join(distRoot, ...segments);
}

function readRepoFile(relPath) {
  return fs.readFileSync(resolveRepoPath(relPath), 'utf8');
}

function readJson(relPath) {
  return JSON.parse(readRepoFile(relPath));
}

function readDistFile(...segments) {
  const absolutePath = resolveDistPath(...segments);
  if (!fs.existsSync(absolutePath)) {
    return null;
  }
  return fs.readFileSync(absolutePath, 'utf8');
}

module.exports = {
  distRoot,
  readDistFile,
  readJson,
  readRepoFile,
  repoRoot,
  resolveDistPath,
  resolveRepoPath,
};
