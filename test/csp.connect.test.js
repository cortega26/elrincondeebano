const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const BUILD_ROOT = process.env.BUILD_OUTPUT_DIR
  ? path.resolve(REPO_ROOT, process.env.BUILD_OUTPUT_DIR)
  : path.join(REPO_ROOT, '.tmp', 'csp-connect-fixtures');

function ensureStagedPolicy() {
  if (process.env.BUILD_OUTPUT_DIR) {
    return;
  }

  const stagedPolicyPath = path.resolve(BUILD_ROOT, 'dist/js/csp.js');
  if (fs.existsSync(stagedPolicyPath)) {
    return;
  }

  fs.rmSync(BUILD_ROOT, { recursive: true, force: true });
  fs.mkdirSync(BUILD_ROOT, { recursive: true });

  const result = spawnSync(process.execPath, [path.join(REPO_ROOT, 'tools/build.js')], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      BUILD_OUTPUT_DIR: BUILD_ROOT,
    },
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    const stderr = result.stderr?.trim();
    const stdout = result.stdout?.trim();
    const detail = stderr || stdout || 'No output captured';
    throw new Error(`Unable to stage dist/js/csp.js for policy checks: ${detail}`);
  }
}

function readPolicy(fileRelativePath) {
  const stagedPath = path.resolve(BUILD_ROOT, fileRelativePath);
  const repoPath = path.resolve(__dirname, '..', fileRelativePath);
  const filePath = fs.existsSync(stagedPath) ? stagedPath : repoPath;

  if (!fs.existsSync(filePath)) {
    throw new Error(`Unable to locate policy file: ${fileRelativePath}`);
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const collapsed = content.replace(/\s+/g, ' ');
  const match = collapsed.match(/connect-src[^;]+;/);
  assert.ok(match, `connect-src directive must exist in ${fileRelativePath}`);
  return match[0];
}

function verifyPolicy(fileRelativePath) {
  const directive = readPolicy(fileRelativePath);
  const requiredHosts = ['https://cloudflareinsights.com'];

  requiredHosts.forEach((host) => {
    assert.ok(
      directive.includes(host),
      `Expected ${host} in connect-src directive for ${fileRelativePath}`
    );
  });

  const forbiddenHosts = [
    'https://www.google-analytics.com',
    'https://analytics.google.com',
    'https://region1.google-analytics.com',
  ];

  forbiddenHosts.forEach((host) => {
    assert.ok(
      !directive.includes(host),
      `Did not expect ${host} in connect-src directive for ${fileRelativePath}`
    );
  });
}

ensureStagedPolicy();
verifyPolicy('src/js/csp.js');
verifyPolicy('dist/js/csp.js');
