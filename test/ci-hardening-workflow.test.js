'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const workflowsDir = path.join(__dirname, '..', '.github', 'workflows');
const autoMergeWorkflow = fs.readFileSync(
  path.join(workflowsDir, 'dependabot-auto-merge.yml'),
  'utf8'
);
const guardWorkflow = fs.readFileSync(path.join(workflowsDir, 'product-data-guard.yml'), 'utf8');
const securityAuditWorkflow = fs.readFileSync(
  path.join(workflowsDir, 'security-audit.yml'),
  'utf8'
);

test('security-audit only references lockfiles that exist', () => {
  const values = [
    ...securityAuditWorkflow.matchAll(/^\s*(?:lockfile|cache-dependency-path):\s*(\S+)\s*$/gm),
  ]
    .map((match) => match[1].replace(/^['"]|['"]$/g, ''))
    .filter((value) => !value.startsWith('${{'));

  assert.ok(values.length > 0, 'expected at least one literal lockfile path');
  for (const value of values) {
    assert.ok(
      fs.existsSync(path.join(__dirname, '..', value)),
      `security-audit references a lockfile that does not exist: ${value}`
    );
  }
});

test('dependabot auto-merge pins fetch-metadata to a full commit SHA', () => {
  assert.match(
    autoMergeWorkflow,
    /dependabot\/fetch-metadata@[0-9a-f]{40} # v\d+\.\d+\.\d+/,
    'fetch-metadata must be pinned to a 40-char commit SHA with a version comment'
  );
  assert.doesNotMatch(
    autoMergeWorkflow,
    /dependabot\/fetch-metadata@v\d/,
    'fetch-metadata must not float on a major-version tag'
  );
});

test('product-data-guard has no credentialed auto-commit job', () => {
  assert.doesNotMatch(
    guardWorkflow,
    /contents:\s*write/,
    'the guard must not hold a write token'
  );
  assert.doesNotMatch(
    guardWorkflow,
    /x-access-token/,
    'the guard must not interpolate a token into the git remote'
  );
  assert.doesNotMatch(guardWorkflow, /\bgit push\b/, 'the guard must not push from CI');
});
